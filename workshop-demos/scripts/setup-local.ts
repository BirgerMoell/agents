import { execFileSync, spawn } from "node:child_process";
import * as os from "node:os";

const model = process.env.LOCAL_LLM_MODEL ?? "gpt-oss:20b";
const embeddingModel = process.env.LOCAL_EMBEDDING_MODEL ?? "embeddinggemma";
const server = "http://127.0.0.1:11434";

if (process.platform !== "darwin" || process.arch !== "arm64") {
  console.log(`Note: detected ${process.platform}/${process.arch}; this setup was tuned for Apple Silicon.`);
}
console.log(`Detected ${Math.round(os.totalmem() / 1024 ** 3)} GB memory.`);

if (!await serverReady()) {
  console.log("Starting Ollama in the background...");
  const child = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" });
  child.unref();
  for (let attempt = 0; attempt < 20 && !await serverReady(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

if (!await serverReady()) {
  throw new Error("Ollama did not start. Open the Ollama app or run `ollama serve`, then retry.");
}

const sizeNote = model === "gpt-oss:20b" ? " This is about 14 GB on disk." : "";
console.log(`Downloading/verifying ${model}.${sizeNote}`);
execFileSync("ollama", ["pull", model], { stdio: "inherit" });
console.log(`Downloading/verifying local embedding model ${embeddingModel}.`);
execFileSync("ollama", ["pull", embeddingModel], { stdio: "inherit" });
console.log("\nReady. Run: npm run index:cgi && npm run demo:05");

async function serverReady(): Promise<boolean> {
  try {
    const response = await fetch(`${server}/api/tags`, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}
