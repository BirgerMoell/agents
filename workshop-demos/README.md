# Local AI Agent Workshop Demos

Seven small demos that add one capability at a time. All reasoning and tool selection run
locally through Ollama; no OpenAI API key or cloud model is required.

The default model is **gpt-oss:20b**. Its Ollama build is about 14 GB and is a good fit for
a 32 GB Apple Silicon Mac: it leaves room for the OS and context cache while providing
strong native function calling. The larger 120B model does not fit this machine.

| Demo | Capability | Default prompt |
| --- | --- | --- |
| 01 | Plain local LLM | Ask about yesterday's AI news |
| 02 | One function tool | Calculate training cost |
| 03 | Tool routing | Choose calculator and clock tools |
| 04 | Web search tool | Find and cite a recent announcement |
| 05 | Local vector RAG | Retrieve CGI facts and AI guidance |
| 06 | Skills | Load a code-review procedure on demand |
| 07 | Agent loop | Inspect, edit, and test a broken program |

## One-time setup

Ollama is already installed on this Mac. From this folder, run:

```bash
npm install
npm run setup:local
```

`setup:local` starts Ollama if necessary and downloads/verifies `gpt-oss:20b` plus the
small `embeddinggemma` embedding model. The initial download is approximately 14 GB plus
621 MB. Later runs are local and do not need an API key.

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
npm run demo:01
npm run demo:02
npm run demo:03
npm run demo:04
npm run demo:05
npm run demo:06
npm run demo:07
```

Most demos accept a replacement prompt after `--`:

```bash
npm run demo:03 -- "What time is it in Stockholm?"
npm run demo:05 -- "How large is CGI and what is its client proximity model?"
```

Every custom tool call is printed as `LLM -> tool(...)`, followed by the observation sent
back to the model. Demo 07 makes the loop especially visible: goal → tests → file reads →
edit → tests → answer. It creates a fresh temporary sandbox on every run.

## Local versus offline

The model is local in every demo. Demos 01–03 and 05–07 can run without internet after
setup. Demo 04 deliberately uses the internet because web search is the capability being
demonstrated; search results are passed to the local model as tool output.

To try a different installed Ollama model:

```bash
LOCAL_LLM_MODEL=qwen3-coder:30b npm run demo:07
```

You can also copy `.env.example` to `.env` to keep local overrides.

## Suggested live sequence

1. Run demo 01 and discuss why a model alone cannot reliably know current events.
2. Run demo 02 and point out that tool selection—not arithmetic—is the interesting part.
3. Ask the audience to predict the calls in demo 03.
4. Run demo 04 to add live public knowledge, then demo 05 to contrast it with a local,
   pre-indexed CGI knowledge base.
5. Compare a tool (what it can do), RAG (what it can know), and a skill (how to do it).
6. End with demo 07 and open `lib/runtime.ts`: the agent loop explicitly carries tool
   calls and observations forward as local chat history.
