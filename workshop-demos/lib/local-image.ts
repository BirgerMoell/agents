import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";

export const imageModel = process.env.LOCAL_IMAGE_MODEL
  ?? "filipstrand/Z-Image-Turbo-mflux-4bit";
export const imageGenerator = process.env.LOCAL_IMAGE_GENERATOR
  ?? path.join(os.homedir(), ".local", "bin", "mflux-generate-z-image-turbo");

export async function generateLocalImage(options: {
  prompt: string;
  outputPath: string;
  seed?: number;
  size?: number;
}): Promise<Record<string, unknown>> {
  const seed = options.seed ?? 42;
  const size = options.size ?? 768;
  if (!fs.existsSync(imageGenerator)) throw new Error("MFLUX is missing. Run npm run setup:image");
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  const code = await runStreaming(imageGenerator, [
    "--model", imageModel, "--prompt", options.prompt,
    "--width", String(size), "--height", String(size),
    "--steps", "9", "--seed", String(seed),
    "--output", options.outputPath, "--metadata",
  ]);
  if (code !== 0 || !fs.existsSync(options.outputPath)) {
    throw new Error(`image generator exited with status ${code}`);
  }
  return {
    status: "created", output_path: options.outputPath, model: imageModel,
    size: `${size}x${size}`, steps: 9, seed, prompt: options.prompt,
    bytes: fs.statSync(options.outputPath).size,
  };
}

export async function unloadOllamaModel(model = process.env.LOCAL_LLM_MODEL ?? "gpt-oss:20b"): Promise<void> {
  const base = (process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
  try {
    await fetch(`${base}/api/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }), signal: AbortSignal.timeout(10_000),
    });
  } catch { /* The next model can still attempt to run. */ }
}

function runStreaming(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}
