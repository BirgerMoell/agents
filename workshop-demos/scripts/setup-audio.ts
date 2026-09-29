import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const uv = path.join(os.homedir(), ".local", "bin", "uv");
const helper = path.join(root, "scripts", "local_audio.py");
const sample = path.join(root, "samples", "demo-meeting.wav");
const response = path.join(root, "samples", "demo-response.wav");
const intermediate = path.join(root, "samples", "demo-meeting.aiff");
fs.mkdirSync(path.dirname(sample), { recursive: true });
const text = "Vi kör den lokala AI-workshopen på fredag klockan tio. Anna ska förbereda demonstrationen av dokumentsökning. Erik ska testa bildmodellen senast på torsdag. Vi beslutade att all känslig data ska stanna på datorn. Vilket rum vi ska använda är fortfarande en öppen fråga.";
console.log("Creating a Swedish sample meeting with the built-in macOS voice...");
execFileSync("say", ["-v", "Alva", "-o", intermediate, text], { stdio: "inherit" });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", intermediate, "-ar", "16000", "-ac", "1", sample], { stdio: "inherit" });
fs.unlinkSync(intermediate);
console.log("Downloading/verifying Pianissimo and transcribing the Swedish sample...");
execFileSync(uv, ["run", helper, "transcribe", "--model", "pianissimo", "--audio", sample], { stdio: "inherit" });
console.log("Downloading/verifying fast Swedish speech synthesis...");
execFileSync(uv, ["run", helper, "synthesize", "--language", "sv", "--voice", "supertonic", "--reference", sample,
  "--text", "Hej! Röstagenten är redo och kör helt lokalt.", "--output", response], { stdio: "inherit" });
console.log("\nReady. Run npm run demo:10 or npm run demo:11");
