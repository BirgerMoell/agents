#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["mlx-audio", "parakeet-mlx==0.5.2", "huggingface_hub[hf_xet]", "supertonic==1.3.1", "soundfile", "sounddevice", "webrtcvad-wheels", "numpy", "psutil", "misaki[en]"]
# ///
import argparse, ast, json, math, operator, os, platform, re, signal, sqlite3, subprocess, time, urllib.parse, urllib.request
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np
import psutil
from local_audio import load_stt, load_tts, synthesize
from voice_agent import Microphone, play_audio, transcribe_pcm

ROOT = Path(__file__).resolve().parent.parent
OLLAMA = os.getenv("LOCAL_LLM_BASE_URL", "http://127.0.0.1:11434/v1").removesuffix("/v1")
MODEL = os.getenv("LOCAL_VOICE_LLM_MODEL", "qwen3.5:4b")
EMBED_MODEL = os.getenv("LOCAL_EMBEDDING_MODEL", "embeddinggemma")
COLOR = os.isatty(1) and "NO_COLOR" not in os.environ
BASH_ENABLED = False

def paint(text, code): return f"\033[{code}m{text}\033[0m" if COLOR else text

TOOLS = [
    {"type":"function","function":{"name":"get_current_weather","description":"Get live current weather for a city using Open-Meteo.","parameters":{"type":"object","properties":{"city":{"type":"string","description":"City name, optionally with country"}},"required":["city"]}}},
    {"type":"function","function":{"name":"get_city_time","description":"Get the real current local time in a city.","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}},
    {"type":"function","function":{"name":"calculate","description":"Safely evaluate an arithmetic expression.","parameters":{"type":"object","properties":{"expression":{"type":"string"}},"required":["expression"]}}},
    {"type":"function","function":{"name":"search_cgi_knowledge","description":"Semantically search the local CGI vector database for grounded company facts.","parameters":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}}},
    {"type":"function","function":{"name":"get_mac_status","description":"Read local Mac model, macOS version, CPU count, and battery status.","parameters":{"type":"object","properties":{},"required":[]}}},
]

BASH_TOOL = {"type":"function","function":{
    "name":"run_bash",
    "description":"Run any Bash command on this Mac. Available only when the demo was launched with Bash enabled.",
    "parameters":{"type":"object","properties":{
        "command":{"type":"string","description":"The complete Bash command to execute"},
        "timeout_seconds":{"type":"integer","description":"Timeout from 1 to 300 seconds; default 30"}
    },"required":["command"]}
}}

def fetch_json(url, params=None):
    if params: url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent":"CGI-local-agent-workshop/1.0"})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.load(response)

@lru_cache(maxsize=32)
def geocode(city):
    data = fetch_json("https://geocoding-api.open-meteo.com/v1/search", {"name":city,"count":1,"language":"en","format":"json"})
    results = data.get("results") or []
    if not results: raise ValueError(f"No city found for {city}")
    return results[0]

WEATHER = {0:"clear",1:"mainly clear",2:"partly cloudy",3:"overcast",45:"foggy",48:"foggy",51:"light drizzle",53:"drizzle",55:"heavy drizzle",61:"light rain",63:"rain",65:"heavy rain",71:"light snow",73:"snow",75:"heavy snow",80:"rain showers",81:"rain showers",82:"heavy rain showers",95:"thunderstorms",96:"thunderstorms with hail",99:"thunderstorms with hail"}

def get_current_weather(city):
    place = geocode(city)
    data = fetch_json("https://api.open-meteo.com/v1/forecast", {
        "latitude":place["latitude"], "longitude":place["longitude"],
        "current":"temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
        "timezone":"auto",
    })
    current = data["current"]
    return {"place":f'{place["name"]}, {place.get("country", "")}'.strip(", "),
            "temperature_c":current["temperature_2m"], "feels_like_c":current["apparent_temperature"],
            "humidity_percent":current["relative_humidity_2m"], "wind_kmh":current["wind_speed_10m"],
            "conditions":WEATHER.get(current["weather_code"], f'weather code {current["weather_code"]}'),
            "observed_at":current["time"], "source":"Open-Meteo"}

def get_city_time(city):
    place = geocode(city); zone = place["timezone"]; now = datetime.now(ZoneInfo(zone))
    return {"place":f'{place["name"]}, {place.get("country", "")}'.strip(", "), "time":now.isoformat(timespec="seconds"), "timezone":zone}

OPS = {ast.Add:operator.add, ast.Sub:operator.sub, ast.Mult:operator.mul, ast.Div:operator.truediv,
       ast.FloorDiv:operator.floordiv, ast.Mod:operator.mod, ast.Pow:operator.pow,
       ast.USub:operator.neg, ast.UAdd:operator.pos}
def calculate(expression):
    if len(expression) > 100: raise ValueError("Expression is too long")
    def evaluate(node):
        if isinstance(node, ast.Expression): return evaluate(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)): return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in OPS:
            left, right = evaluate(node.left), evaluate(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 12: raise ValueError("Exponent is too large")
            return OPS[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in OPS: return OPS[type(node.op)](evaluate(node.operand))
        raise ValueError("Only arithmetic operators and numbers are allowed")
    value = evaluate(ast.parse(expression, mode="eval"))
    if not math.isfinite(float(value)): raise ValueError("Result is not finite")
    return {"expression":expression, "result":value}

def post_json(path, body, timeout=120):
    request = urllib.request.Request(OLLAMA + path, data=json.dumps(body).encode(), headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response: return json.load(response)

def search_cgi_knowledge(query):
    db_path = ROOT / "knowledge/cgi-vectors.sqlite"
    if not db_path.exists(): raise ValueError("CGI database missing; run npm run index:cgi")
    vector = np.asarray(post_json("/api/embed", {"model":EMBED_MODEL,"input":query})["embeddings"][0], dtype=np.float32)
    with sqlite3.connect(db_path) as db:
        rows = db.execute("SELECT source_url, heading, content, embedding FROM chunks").fetchall()
    hits = []
    for source, heading, content, blob in rows:
        candidate = np.frombuffer(blob, dtype=np.float32)
        score = float(np.dot(vector, candidate) / (np.linalg.norm(vector) * np.linalg.norm(candidate)))
        hits.append((score, source, heading, content))
    return {"hits":[{"score":round(score,3),"heading":heading,"source":source,"excerpt":content[:900]} for score,source,heading,content in sorted(hits, reverse=True)[:3]]}

def get_mac_status():
    battery = psutil.sensors_battery()
    status = None if battery is None else {
        "percent":round(battery.percent),
        "state":"charging" if battery.power_plugged else "discharging",
        "minutes_remaining":None if battery.secsleft < 0 else round(battery.secsleft / 60),
    }
    return {"computer":platform.machine(), "macos":platform.mac_ver()[0], "cpu_count":os.cpu_count(), "battery":status}

def run_bash(command, timeout_seconds=30):
    if not isinstance(command, str) or not command.strip(): raise ValueError("Command cannot be empty")
    timeout_seconds = max(1, min(int(timeout_seconds), 300))
    print(paint(f"  bash       $ {command}", "35"), flush=True)
    process = subprocess.Popen(
        ["/bin/bash", "-lc", command], cwd=ROOT, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True,
    )
    timed_out = False
    try:
        output, _ = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try: output, _ = process.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL); output, _ = process.communicate()
    output = output or ""
    print(paint("  bash out   ", "34") + (output.rstrip() or "(no output)"), flush=True)
    visible = output if len(output) <= 12000 else output[:6000] + "\n...[output truncated]...\n" + output[-6000:]
    return {"command":command, "working_directory":str(ROOT), "exit_code":process.returncode,
            "timed_out":timed_out, "output":visible}

FUNCTIONS = {"get_current_weather":get_current_weather, "get_city_time":get_city_time,
             "calculate":calculate, "search_cgi_knowledge":search_cgi_knowledge,
             "get_mac_status":lambda: get_mac_status()}

def enable_bash_tool():
    global BASH_ENABLED
    BASH_ENABLED = True
    if not any(tool["function"]["name"] == "run_bash" for tool in TOOLS): TOOLS.append(BASH_TOOL)
    FUNCTIONS["run_bash"] = run_bash

def bash_requested(text):
    words = re.findall(r"[a-zåäö0-9-]+", text.casefold())
    aliases = ("bash", "bärs", "bäs", "bashverktyg", "bärsverktyg", "basverktyg", "terminal", "shell")
    return any(word.startswith(aliases) for word in words) or any(
        word in {"kommando", "kommandot", "command"} for word in words
    )

def plan_bash_command(text, history):
    prior_requests = [message["content"] for message in history if message.get("role") == "user"][-2:]
    context = "\n".join(f"Earlier user request: {request}" for request in prior_requests)
    body = {"model":MODEL, "stream":False, "think":False, "keep_alive":"10m",
            "format":{"type":"object","properties":{"command":{"type":"string"}},
                      "required":["command"],"additionalProperties":False},
            "messages":[
                {"role":"system","content":"Convert the user's explicitly authorized Bash task into one executable Bash command. Return only the requested JSON. Do not refuse, explain, or use Markdown. Preserve requested filenames exactly."},
                {"role":"user","content":f"{context}\nCurrent user request: {text}".strip()},
            ], "options":{"temperature":0.1,"num_predict":300}}
    response = post_json("/api/chat", body, timeout=180)
    raw = response.get("message", {}).get("content", "")
    planned = json.loads(raw)
    command = planned.get("command", "").strip()
    if not command: raise ValueError("The Bash planner returned an empty command")
    return command

def stream_turn(messages):
    body = {"model":MODEL,"messages":messages,"tools":TOOLS,"stream":True,"think":False,
            "keep_alive":"10m","options":{"temperature":0.2,"num_predict":180}}
    request = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(body).encode(), headers={"Content-Type":"application/json"})
    content, calls, began = [], [], False
    with urllib.request.urlopen(request, timeout=180) as response:
        for line in response:
            event = json.loads(line); message = event.get("message", {})
            token = message.get("content", "")
            if token:
                if not began: print(paint("  response   ", "32"), end="", flush=True); began = True
                print(token, end="", flush=True); content.append(token)
            calls.extend(message.get("tool_calls") or [])
    if began: print(flush=True)
    return "".join(content).strip(), calls

def run_tool_agent(text, history, skill):
    started = time.perf_counter()
    expected_bash, corrected = BASH_ENABLED and bash_requested(text), False
    messages = [{"role":"system","content":skill}] + history + [{"role":"user","content":text}]
    for step in range(1, 5):
        print(paint(f"  thinking   model step {step}...", "33"), flush=True)
        content, calls = stream_turn(messages)
        if not calls:
            if expected_bash and not corrected:
                print(paint("  guardrail  spoken Bash request requires run_bash; retrying", "31"), flush=True)
                if content: messages.append({"role":"assistant","content":content})
                messages.append({"role":"system","content":"The Bash tool is enabled. The user explicitly requested it; call run_bash now and complete the requested computer task. Swedish speech recognition may spell Bash as bärs, bäs, or bas. Do not refuse and do not ask for confirmation."})
                corrected = True
                continue
            if expected_bash and corrected:
                print(paint("  guardrail  tool retry was empty; using structured Bash planner", "31"), flush=True)
                try:
                    command = plan_bash_command(text, history)
                    print(paint(f"  action     run_bash({json.dumps({'command':command}, ensure_ascii=False)})", "35"), flush=True)
                    result = run_bash(command)
                    serialized = json.dumps(result, ensure_ascii=False)
                except Exception as error:
                    command = ""
                    serialized = json.dumps({"error":str(error)}, ensure_ascii=False)
                print(paint(f"  result     {serialized[:700]}", "34"), flush=True)
                synthetic_call = {"function":{"name":"run_bash","arguments":{"command":command}}}
                messages.append({"role":"assistant","content":"","tool_calls":[synthetic_call]})
                messages.append({"role":"tool","tool_name":"run_bash","content":serialized})
                expected_bash = False
                continue
            print(paint(f"  answered   {time.perf_counter()-started:.2f}s total", "32"), flush=True)
            if not content:
                content = "Jag fick inget svar från modellen. Försök igen eller formulera kommandot tydligare."
                print(paint("  response   ", "32") + content, flush=True)
            return content
        if any(call.get("function", {}).get("name") == "run_bash" for call in calls): expected_bash = False
        messages.append({"role":"assistant","content":content,"tool_calls":calls})
        for call in calls:
            function = call.get("function", {}); name = function.get("name", "")
            arguments = function.get("arguments") or {}
            if isinstance(arguments, str): arguments = json.loads(arguments)
            print(paint(f"  action     {name}({json.dumps(arguments, ensure_ascii=False)})", "35"), flush=True)
            try:
                if name not in FUNCTIONS: raise ValueError("Unknown tool")
                result = FUNCTIONS[name](**arguments)
                serialized = json.dumps(result, ensure_ascii=False)
            except Exception as error:
                serialized = json.dumps({"error":str(error)}, ensure_ascii=False)
            print(paint(f"  result     {serialized[:700]}", "34"), flush=True)
            messages.append({"role":"tool","tool_name":name,"content":serialized})
    raise RuntimeError("Tool agent exceeded four model steps")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", help="Run one test turn without a microphone")
    parser.add_argument("--no-play", action="store_true")
    parser.add_argument("--barge-in", action="store_true")
    parser.add_argument("--no-space-to-talk", action="store_true",
                        help="Disable the default SPACE key playback interruption")
    parser.add_argument("--enable-bash", action="store_true",
                        help="Give the local model unrestricted Bash access as the current user")
    parser.add_argument("--self-test-bash", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.enable_bash:
        enable_bash_tool()
        print(paint("  bash       ENABLED — commands run as your macOS user", "31"), flush=True)
    if args.self_test_bash:
        if not args.enable_bash: parser.error("--self-test-bash requires --enable-bash")
        result = run_bash("printf 'bash-tool-ok'")
        assert result["exit_code"] == 0 and result["output"] == "bash-tool-ok"
        planned = plan_bash_command("Use Bash to print exactly bash-planner-ok with printf.", [])
        planned_result = run_bash(planned)
        assert planned_result["exit_code"] == 0 and "bash-planner-ok" in planned_result["output"]
        print(paint("  self-test  Bash execution, structured planning, and output capture passed", "32"), flush=True)
        return
    skill = (ROOT / "skills/voice-tool-agent/SKILL.md").read_text()
    print(paint("  skill      loaded voice-tool-agent", "36"), flush=True)
    print("Loading local Swedish speech models...", flush=True)
    stt, tts, history = load_stt("pianissimo"), load_tts("sv", "supertonic"), []
    print(f'  models     STT={stt["model_id"]}  LLM={MODEL}  TTS={tts["model_id"]}', flush=True)
    mic = None
    if not args.text:
        print("Requesting microphone access (approve Codex/Terminal if prompted)...", flush=True)
        mic = Microphone(); mic.stream.start()
    try:
        while True:
            if args.text: utterance = args.text
            else:
                partial = ""
                def show_partial(raw):
                    nonlocal partial
                    candidate = transcribe_pcm(stt, raw)
                    if candidate and candidate != partial:
                        partial = candidate; print(f'  live       "{partial}"', flush=True)
                raw = mic.capture(show_partial); started = time.perf_counter()
                utterance = transcribe_pcm(stt, raw)
                print(f'  transcript "{utterance}" ({time.perf_counter()-started:.2f}s)', flush=True)
            if not utterance: continue
            answer = run_tool_agent(utterance, history, skill)
            answer = answer.strip() or "Jag fick inget svar från modellen. Försök igen."
            print("  voice      generating local speech...", flush=True); started = time.perf_counter()
            audio, rate = synthesize(tts, answer)
            print(f"  voice      synthesized in {time.perf_counter()-started:.2f}s", flush=True)
            if not args.no_play: play_audio(audio, rate, mic, args.barge_in, not args.no_space_to_talk)
            history = (history + [{"role":"user","content":utterance},{"role":"assistant","content":answer}])[-8:]
            if args.text: break
    except KeyboardInterrupt: print("\nVoice tool agent stopped.")
    finally:
        if mic: mic.stream.stop(); mic.stream.close()

if __name__ == "__main__": main()
