import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { arg, openai } from "./lib/runtime.js";
import { generateLocalImage, unloadOllamaModel } from "./lib/local-image.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, "outputs");
const request = arg("Image request", "A welcoming AI workshop in Östersund, cinematic Nordic evening light");
const skill = fs.readFileSync(path.join(here, "skills", "visual-critique", "SKILL.md"), "utf8");
const visionModel = process.env.LOCAL_VISION_MODEL ?? "qwen3-vl:8b";

console.log("\n  skill    loaded visual-critique");
const prompt = await textCompletion(`${skill}\n\nWrite only the version-one image prompt for: ${request}`);
const first = path.join(outputDir, "demo-09-before.png");
const second = path.join(outputDir, "demo-09-after.png");

console.log(`\n  generate version 1\n  prompt   ${prompt}\n`);
await unloadOllamaModel();
await generateLocalImage({ prompt, outputPath: first, seed: 42, size: 640 });

console.log(`\n  inspect  ${first}\n  model    ${visionModel}`);
const critique = await inspectImage(first, request, visionModel);
console.log(`\n  critique ${critique.critique}`);
console.log(`\n  revised  ${critique.revised_prompt}`);

await unloadOllamaModel(visionModel);
console.log("\n  generate version 2\n");
await generateLocalImage({ prompt: critique.revised_prompt, outputPath: second, seed: 42, size: 640 });
console.log(`\n✓ Before: ${first}\n✓ After:  ${second}`);

async function textCompletion(promptText: string): Promise<string> {
  const response = await openai().chat.completions.create({
    model: process.env.LOCAL_LLM_MODEL ?? "gpt-oss:20b",
    messages: [{ role: "user", content: promptText }], reasoning_effort: "low",
  });
  return response.choices[0]?.message.content?.trim() || request;
}

async function inspectImage(imagePath: string, intent: string, model: string): Promise<{ critique: string; revised_prompt: string }> {
  const base = (process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
  const response = await fetch(`${base}/api/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model, stream: false,
      messages: [{ role: "user", content: `Inspect this generated image for the intent: ${intent}. Return JSON only with critique and revised_prompt.`, images: [fs.readFileSync(imagePath).toString("base64")] }],
      format: "json", keep_alive: 0,
    }),
  });
  if (!response.ok) throw new Error(`Vision model failed: ${response.status} ${await response.text()}`);
  const data = await response.json() as { message?: { content?: string } };
  return JSON.parse(data.message?.content ?? "{}") as { critique: string; revised_prompt: string };
}
