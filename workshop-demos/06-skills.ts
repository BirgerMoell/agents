import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { arg, printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.join(here, "skills");

const definition: FunctionDefinition = {
  type: "function",
  name: "load_skill",
  description: "Load reusable procedural instructions for a named task.",
  strict: true,
  parameters: {
    type: "object",
    properties: { name: { type: "string", enum: ["code-review"] } },
    required: ["name"],
    additionalProperties: false,
  },
};

const loadSkill: DemoTool = {
  definition,
  run: ({ name }) => {
    const safeName = String(name);
    if (safeName !== "code-review") return "error: unknown skill";
    return fs.readFileSync(path.join(skillsDir, safeName, "SKILL.md"), "utf8");
  },
};

const sample = `
function canAccess(record, user) {
  if (record.isPublic) return true;
  if (user.role === "admin") return true;
  return record.ownerId = user.id;
}`;

const prompt = arg("Task", `Load the code-review skill, then review this JavaScript:\n${sample}`);
printAnswer(await runAgent({
  prompt,
  instructions: "When a named skill matches the task, load it before doing the work and follow it.",
  tools: [loadSkill],
}));
