import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { arg, printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";
import { generateLocalImage, imageGenerator, imageModel, unloadOllamaModel } from "./lib/local-image.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.join(here, "skills", "local-image-generation", "SKILL.md");
const outputDir = path.join(here, "outputs");
const outputPath = path.join(outputDir, "demo-08.png");

const loadSkill: DemoTool = {
  definition: definition(
    "load_skill",
    "Load the local image-generation procedure before creating an image.",
    { name: { type: "string", enum: ["local-image-generation"] } },
    ["name"],
  ),
  run: ({ name }) => {
    if (name !== "local-image-generation") return JSON.stringify({ error: "unknown skill" });
    return fs.readFileSync(skillPath, "utf8");
  },
};

const generateImage: DemoTool = {
  definition: definition(
    "generate_image",
    "Generate one 768x768 PNG locally with Z-Image-Turbo through Apple MLX.",
    {
      prompt: { type: "string", description: "A complete description of visible image content." },
      seed: { type: "integer", description: "A reproducible integer seed." },
    },
    ["prompt", "seed"],
  ),
  streamsProgress: true,
  run: async ({ prompt, seed }) => {
    const finalPrompt = String(prompt).trim();
    const finalSeed = Number(seed);
    if (!finalPrompt) return JSON.stringify({ error: "prompt must not be empty" });
    if (!Number.isSafeInteger(finalSeed)) return JSON.stringify({ error: "seed must be an integer" });
    if (!fs.existsSync(imageGenerator)) {
      return JSON.stringify({
        error: `MFLUX is not installed at ${imageGenerator}`,
        fix: "Run npm run setup:image",
      });
    }

    console.log("\n  memory   unloading the Ollama text model before image generation");
    await unloadOllamaModel();
    console.log(`  image    model ${imageModel}`);
    console.log("  image    768x768, 9 steps; the first run downloads the model\n");

    return JSON.stringify(await generateLocalImage({
      prompt: finalPrompt, outputPath, seed: finalSeed, size: 768,
    }));
  },
};

const request = arg(
  "Image request",
  "Create a cinematic illustration of a friendly AI workshop in Östersund, with people collaborating around a glowing local computer, warm Nordic evening light.",
);

printAnswer(await runAgent({
  prompt: request,
  instructions: [
    "You are running an image-generation demonstration.",
    "You must first call load_skill with local-image-generation and follow the returned procedure.",
    "Then call generate_image exactly once. Do not finish without invoking it.",
  ].join(" "),
  tools: [loadSkill, generateImage],
  maxSteps: 4,
}));

function definition(
  name: string,
  description: string,
  properties: Record<string, object>,
  required: string[],
): FunctionDefinition {
  return {
    type: "function",
    name,
    description,
    strict: true,
    parameters: { type: "object", properties, required, additionalProperties: false },
  };
}
