import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const uv = path.join(os.homedir(), ".local", "bin", "uv");
const helper = path.join(here, "scripts", "local_audio.py");
const audioPath = path.resolve(process.argv[2] ?? path.join(here, "samples", "demo-meeting.wav"));
if (!fs.existsSync(audioPath)) throw new Error(`Audio not found: ${audioPath}. Run npm run setup:audio first.`);

const definition: FunctionDefinition = {
  type: "function", name: "transcribe_audio",
  description: "Transcribe an audio file completely locally with an Apple-MLX speech model.", strict: true,
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
};
const transcribe: DemoTool = {
  definition,
  run: async ({ path: requested }) => {
    if (path.resolve(String(requested)) !== audioPath) return JSON.stringify({ error: "path not approved" });
    const { stdout } = await exec(uv, ["run", helper, "transcribe", "--audio", audioPath], { maxBuffer: 10_000_000 });
    const marker = stdout.split("\n").reverse().find((line: string) => line.startsWith("RESULT_JSON:"));
    if (!marker) return JSON.stringify({ error: "transcriber returned no result" });
    return marker.slice("RESULT_JSON:".length);
  },
};

console.log(`\nAudio: ${audioPath}`);
printAnswer(await runAgent({
  prompt: `Create concise private meeting notes from the audio file at ${audioPath}.`,
  instructions: [
    "Call transcribe_audio before writing notes.",
    "Write headings and all prose in the transcript language; language sv means Swedish.",
    "Return Summary, Decisions, Action items, and Open questions.",
    "Every bullet must be directly supported by the transcript; do not add plausible follow-ups.",
    "Do not invent names, owners, deadlines, actions, questions, or decisions absent from the transcript.",
    "A name followed by a comma at the start may be an addressee, not an action owner.",
    "Do not turn a proposed meeting time into a separately assigned scheduling task.",
    "Preserve tense and deadlines exactly: never change a future task into a completed past action.",
    "If a section has no supported content, write None.",
    "Mention that audio and inference stayed local.",
  ].join(" "), tools: [transcribe], maxSteps: 3,
}));
