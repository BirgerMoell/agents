import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const uv = path.join(os.homedir(), ".local", "bin", "uv");
const generator = process.env.LOCAL_IMAGE_GENERATOR
  ?? path.join(os.homedir(), ".local", "bin", "mflux-generate-z-image-turbo");
const model = process.env.LOCAL_IMAGE_MODEL ?? "filipstrand/Z-Image-Turbo-mflux-4bit";
const output = path.join(root, "outputs", "image-model-check.png");

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("The local image demo requires an Apple-Silicon Mac.");
}
if (!fs.existsSync(uv)) {
  throw new Error(`uv was not found at ${uv}. Install it from https://docs.astral.sh/uv/ first.`);
}
if (!fs.existsSync(generator)) {
  console.log("Installing the Apple-MLX MFLUX runtime...");
  execFileSync(uv, ["tool", "install", "--upgrade", "mflux"], { stdio: "inherit" });
}

fs.mkdirSync(path.dirname(output), { recursive: true });
console.log(`Downloading/verifying ${model} with a small local test generation...`);
execFileSync(generator, [
  "--model", model,
  "--prompt", "A small glowing green leaf on a clean white background",
  "--width", "512",
  "--height", "512",
  "--steps", "9",
  "--seed", "42",
  "--output", output,
], { stdio: "inherit" });
console.log(`\nReady. Test image: ${output}`);
console.log("Run: npm run demo:08");
