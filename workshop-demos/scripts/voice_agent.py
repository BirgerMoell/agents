#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["mlx-audio", "parakeet-mlx==0.5.2", "huggingface_hub[hf_xet]", "supertonic==1.3.1", "soundfile", "sounddevice", "webrtcvad-wheels", "numpy", "misaki[en]"]
# ///
import argparse, json, os, queue, select, subprocess, sys, tempfile, termios, threading, time, tty, urllib.request
from collections import deque
from pathlib import Path
import numpy as np
import sounddevice as sd
import soundfile as sf
import webrtcvad
from local_audio import load_stt, load_tts, transcribe, synthesize

RATE, FRAME_MS, BLOCK = 16000, 30, 480

def transcribe_pcm(stt, raw):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp:
        sf.write(temp.name, np.frombuffer(raw, dtype=np.int16), RATE, subtype="PCM_16")
        audio_path = temp.name
    try:
        return transcribe(stt, audio_path)
    finally:
        os.unlink(audio_path)

class Microphone:
    def __init__(self):
        self.frames = queue.Queue()
        self.vad = webrtcvad.Vad(2)
        self.barge = threading.Event()
        self.consecutive = 0
        self.stream = sd.RawInputStream(samplerate=RATE, blocksize=BLOCK, channels=1, dtype="int16", callback=self.callback)
    def callback(self, data, frames, timing, status):
        raw = bytes(data)
        speech = self.vad.is_speech(raw, RATE)
        self.consecutive = self.consecutive + 1 if speech else 0
        if self.consecutive >= 3: self.barge.set()
        self.frames.put((raw, speech))
    def capture(self, on_partial=None):
        pre, captured, speaking, silence, last_preview = deque(maxlen=10), [], False, 0, 0
        print("\n  listening  speak now (Ctrl+C to stop)", flush=True)
        while True:
            raw, speech = self.frames.get()
            if not speaking:
                pre.append(raw)
                if speech:
                    speaking = True; captured.extend(pre); print("  hearing    voice detected", flush=True)
            else:
                captured.append(raw); silence = 0 if speech else silence + 1
                if on_partial and len(captured) >= 40 and len(captured) - last_preview >= 40 and silence < 10:
                    last_preview = len(captured)
                    on_partial(b"".join(captured))
                if silence >= 20: return b"".join(captured)
    def drain(self):
        while True:
            try: self.frames.get_nowait()
            except queue.Empty: return

def ask_ollama(text, history, skill):
    started = time.perf_counter()
    messages = [{"role":"system","content":skill}] + history + [{"role":"user","content":text}]
    body = json.dumps({
        "model":"qwen3.5:4b", "messages":messages, "stream":True, "think":False,
        "keep_alive":"10m", "options":{"temperature":0.2, "num_predict":80},
    }).encode()
    req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body, headers={"Content-Type":"application/json"})
    print("  thinking   local model is preparing a reply...", flush=True)
    chunks, began = [], False
    with urllib.request.urlopen(req, timeout=180) as response:
        for line in response:
            event = json.loads(line)
            if event.get("error"): raise RuntimeError(event["error"])
            token = event.get("message", {}).get("content", "")
            if not token: continue
            if not began:
                print(f"  first word {time.perf_counter()-started:.2f}s", flush=True)
                print("  response   ", end="", flush=True); began = True
            print(token, end="", flush=True); chunks.append(token)
    print(flush=True)
    print(f"  answered   {time.perf_counter()-started:.2f}s total", flush=True)
    return "".join(chunks).strip() or "Jag fick inget svar från modellen. Försök igen."

def play_audio(audio, rate, mic=None, allow_barge_in=False, space_to_talk=True):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp:
        sf.write(temp.name, np.asarray(audio, dtype=np.float32), rate)
        audio_path = temp.name
    if mic:
        mic.barge.clear(); mic.consecutive = 0
    keyboard_fd, terminal_state = None, None
    if space_to_talk and sys.stdin.isatty():
        try:
            keyboard_fd = sys.stdin.fileno(); terminal_state = termios.tcgetattr(keyboard_fd)
            tty.setcbreak(keyboard_fd)
        except (OSError, termios.error): keyboard_fd, terminal_state = None, None
    voice_mode = "voice barge-in enabled; use headphones" if allow_barge_in else "speaker-safe"
    key_mode = "; press SPACE to interrupt and talk" if keyboard_fd is not None else ""
    mode = voice_mode + key_mode
    print(f"  speaking   macOS default output ({mode})", flush=True)
    player = subprocess.Popen(
        ["/usr/bin/afplay", audio_path], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    interrupted, space_interrupted = False, False
    try:
        while player.poll() is None:
            if keyboard_fd is not None and select.select([keyboard_fd], [], [], 0)[0]:
                if os.read(keyboard_fd, 1) == b" ":
                    interrupted = space_interrupted = True; player.terminate()
                    if mic: mic.drain()
                    print("  interrupted SPACE pressed — listening now", flush=True)
                    break
            if mic and allow_barge_in and mic.barge.is_set():
                interrupted = True; player.terminate()
                print("  interrupted user started speaking", flush=True)
                break
            time.sleep(0.03)
        _, error = player.communicate(timeout=3)
        if player.returncode not in {0, -15}:
            raise RuntimeError(f"afplay failed: {error.decode().strip()}")
    finally:
        if player.poll() is None: player.kill()
        os.unlink(audio_path)
        if terminal_state is not None: termios.tcsetattr(keyboard_fd, termios.TCSADRAIN, terminal_state)
    if mic and (not interrupted or space_interrupted): mic.drain()
    if not interrupted: print("  played     audio finished", flush=True)
    return interrupted

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", help="Run one test turn without a microphone")
    parser.add_argument("--no-play", action="store_true")
    parser.add_argument("--barge-in", action="store_true",
                        help="Allow speech to interrupt playback; requires headphones to avoid speaker echo")
    parser.add_argument("--no-space-to-talk", action="store_true",
                        help="Disable the default SPACE key playback interruption")
    parser.add_argument("--stt-model", choices=["pianissimo", "parakeet"], default=None,
                        help="Swedish Pianissimo is the default; use parakeet for multilingual speech")
    parser.add_argument("--language", choices=["sv", "en"], default=None,
                        help="Response/TTS language; defaults to sv with Pianissimo and en with Parakeet")
    parser.add_argument("--voice", choices=["supertonic", "chatterbox", "kokoro"], default=None,
                        help="Voice backend; defaults to Supertonic for Swedish and Kokoro for English")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    skill = (root / "skills/voice-agent/SKILL.md").read_text()
    language = args.language or ("en" if args.stt_model == "parakeet" else "sv")
    reference = str(root / "samples/demo-meeting.wav") if language == "sv" else None
    print("Loading local speech recognition and speech synthesis models...", flush=True)
    stt, tts, history = load_stt(args.stt_model), load_tts(language, args.voice), []
    print(f'  models     STT={stt["model_id"]}  TTS={tts["model_id"]}', flush=True)
    if args.text:
        mic = None
    else:
        print("Requesting microphone access (approve Codex/Terminal in macOS if prompted)...", flush=True)
        mic = Microphone()
        mic.stream.start()
    try:
        while True:
            if args.text: utterance = args.text
            else:
                partial = ""
                def show_partial(preview_raw):
                    nonlocal partial
                    candidate = transcribe_pcm(stt, preview_raw)
                    if candidate and candidate != partial:
                        partial = candidate
                        print(f'  live       "{partial}"', flush=True)
                raw = mic.capture(show_partial)
                started = time.perf_counter(); utterance = transcribe_pcm(stt, raw)
                print(f'  transcript "{utterance}" ({time.perf_counter()-started:.2f}s)', flush=True)
            if not utterance: continue
            answer = ask_ollama(utterance, history, skill)
            print("  voice      generating local speech...", flush=True)
            started = time.perf_counter(); audio, rate = synthesize(tts, answer, reference)
            print(f"  voice      synthesized in {time.perf_counter()-started:.2f}s", flush=True)
            if not args.no_play:
                play_audio(audio, rate, mic, args.barge_in, not args.no_space_to_talk)
            history.extend([{"role":"user","content":utterance},{"role":"assistant","content":answer}])
            history = history[-8:]
            if args.text: break
    except KeyboardInterrupt: print("\nVoice agent stopped.")
    finally:
        if mic: mic.stream.stop(); mic.stream.close()

if __name__ == "__main__": main()
