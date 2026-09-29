# Local AI Agent Workshop Demos

Thirteen small demos that add one capability at a time. All reasoning and tool selection run
locally through Ollama; no OpenAI API key or cloud model is required.

The default model is **gpt-oss:20b**. Its Ollama build is about 14 GB and is a good fit for
a 32 GB Apple Silicon Mac: it leaves room for the OS and context cache while providing
strong native function calling. The larger 120B model does not fit this machine.

| Demo | Capability | Default prompt |
| --- | --- | --- |
| 01_plain | Web research, no clock | Search yesterday's AI news using the date inferred by the model |
| 01_tool | Web research + date tool | Resolve “yesterday” with the real clock, then run the same search |
| 02 | One function tool | Calculate training cost |
| 03 | Tool routing | Choose calculator and clock tools |
| 04 | Verified web research | Search, open, verify, and cite a recent announcement |
| 05 | Local vector RAG | Retrieve CGI facts and AI guidance |
| 06 | Skills | Load a code-review procedure on demand |
| 07 | Agent loop | Inspect, edit, and test a broken program |
| 08 | Skill + local image model | Load a visual procedure and generate a PNG locally |
| 09 | Visual critique loop | Generate, inspect the actual pixels, revise, and regenerate |
| 10 | Private meeting notes | Transcribe local audio, then extract grounded actions and decisions |
| 11 | Speech-to-speech agent | Listen, think, speak, and support barge-in entirely on the Mac |
| 12 | Skilled voice tool agent | Speak naturally while calling live weather, time, math, CGI RAG, and Mac tools |

## One-time setup

Ollama is already installed on this Mac. From this folder, run:

```bash
npm install
npm run setup:local
npm run setup:image
npm run setup:audio
```

`setup:local` starts Ollama if necessary and downloads/verifies `gpt-oss:20b` plus the
small `embeddinggemma` embedding model. The initial download is approximately 14 GB plus
621 MB. Later runs are local and do not need an API key.

`setup:image` installs the Apple-Silicon-native MFLUX runtime and downloads the 4-bit
Z-Image-Turbo checkpoint by generating a small test image. The image model has 6B parameters,
runs in nine steps, and is quantized to fit comfortably alongside a workshop environment on
this 32 GB Mac. The first setup takes longer; later image generations are fully local.

`setup:audio` creates a Swedish sample meeting and downloads Pianissimo MLX 8-bit, a
Swedish speech recognizer tuned for Apple Silicon. It uses about 2.2 GB while transcribing.
Supertonic 3 is the fast Swedish voice: its 99M-parameter ONNX model runs locally on CPU,
leaving the GPU available for the agent. Chatterbox remains available as a voice-cloning
comparison, Kokoro 82M remains the English voice, and generic multilingual Parakeet remains
available as a transcription fallback.

Demo 09 also needs the local vision model:

```bash
ollama pull qwen3-vl:8b
```

Build the CGI vector database once (and again whenever you edit the source Markdown):

```bash
npm run index:cgi
```

This chunks five curated pages from CGI's official websites, creates embeddings locally,
and stores the chunks, source URLs, and vectors in `knowledge/cgi-vectors.sqlite`.
The Markdown is a workshop snapshot dated 2026-09-27 rather than a live scraper, so the
demo is deterministic and works offline.

You can demonstrate retrieval without asking the chat model to write an answer:

```bash
npm run search:cgi -- "How does CGI govern AI agents?"
```

## Run the demos

```bash
npm run demo:01_plain
npm run demo:01_tool
npm run demo:02
npm run demo:03
npm run demo:04
npm run demo:05
npm run demo:06
npm run demo:07
npm run demo:08
npm run demo:09
npm run demo:10
npm run demo:11
npm run demo:12
```

Most demos accept a replacement prompt after `--`:

```bash
npm run demo:03 -- "What time is it in Stockholm?"
npm run demo:05 -- "How large is CGI and what is its client proximity model?"
npm run demo:08 -- "A friendly robot presenting an AI workshop in Stockholm"
npm run demo:09 -- "A cinematic poster for a private, local AI workshop"
npm run demo:10 -- ./path/to/meeting.wav
npm run demo:11 -- --stt-model parakeet
npm run demo:11 -- --voice chatterbox
npm run demo:12 -- --text "Vad är temperaturen i Stockholm?"
```

Every custom tool call is printed as `LLM -> tool(...)`, followed by the observation sent
back to the model. Responses stream token by token, with visible model steps, elapsed wait
time, reasoning, tool actions, and observations. Demo 07 makes the loop especially visible:
goal → tests → file reads → edit → tests → answer. It creates a fresh temporary sandbox
on every run. Terminal colours distinguish waiting, reasoning, tool calls, observations,
guardrails, and final answers. Set `NO_COLOR=1` to disable colours.

Demo 11 additionally prints partial `live` transcripts while you are speaking, the final
transcript, time to the LLM's first word, streamed response tokens, and speech-generation
time. Hidden LLM reasoning is disabled for this conversational path. On the current M5,
the reply text normally begins in under a second once loaded; Swedish Chatterbox audio can
take several more seconds to synthesize before playback begins. Playback uses macOS
`afplay` and therefore follows the output device selected in System Settings.

## Local versus offline

The model is local in every demo. Demos 02–03 and 05–11 can run without internet after
setup. Demos 01_plain, 01_tool, and 04 deliberately use the internet for web research.
They use Tavily's official TypeScript SDK in keyless mode by default. For a reliable live
workshop, set `TAVILY_API_KEY` in `.env`. Search results are only leads: the
agent must extract an actual result page before it may use or cite the page. An evidence
guardrail rejects drafts that cite unopened URLs or label secondary pages as primary
sources. This prevents the agent from constructing plausible-looking source links.

Demo 12 is mostly local: calculation, Mac status, CGI vector search, speech, and reasoning
stay on the computer. Its weather and city-time tools use Open-Meteo geocoding and forecast
endpoints, so those two capabilities require internet access. The terminal prints the exact
tool arguments and returned observations before the answer is spoken.

To try a different installed Ollama model:

```bash
LOCAL_LLM_MODEL=qwen3-coder:30b npm run demo:07
```

You can also copy `.env.example` to `.env` to keep local overrides.

## Suggested live sequence

1. Run `01_plain`: it can browse the web, but must guess which date “yesterday” means.
2. Run `01_tool` with the same prompt: it reads the computer clock first, then searches
   the web using the correct calendar date. Compare the tool traces and results.
3. Run demo 02 and point out that tool selection—not arithmetic—is the interesting part.
4. Ask the audience to predict the calls in demo 03.
5. Run demo 04 to add live public knowledge, then demo 05 to contrast it with a local,
   pre-indexed CGI knowledge base.
6. Compare a tool (what it can do), RAG (what it can know), and a skill (how to do it).
7. Run demo 07 and open `lib/runtime.ts`: the agent loop explicitly carries tool
   calls and observations forward as local chat history.
8. End with demo 08: the agent loads a reusable image skill, unloads the text model to free
   unified memory, and invokes a second local model to create `outputs/demo-08.png`.
9. Run demo 09 to reveal a multimodal feedback loop: it generates an image, asks a local
   vision model to critique the real pixels, then applies only the highest-value fixes.
10. Run demo 10 with the bundled meeting recording, then replace it with a short audience
    recording to show that private transcription and action extraction stay on the laptop.
11. Finish with demo 11. Use headphones, talk naturally, and start speaking while the agent
    answers to demonstrate barge-in by running `npm run demo:11 -- --barge-in`. Normal mode
    disables barge-in so the laptop speakers cannot interrupt themselves. On the first run,
    allow microphone access for Codex or Terminal in macOS System Settings. Press Ctrl+C to stop.
12. Add demo 12 to show that the same voice loop can load a routing skill and call real tools.
    Ask for Stockholm weather, Tokyo time, a calculation, a CGI fact, or this Mac's battery.
