import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workshop-"));
fs.cpSync(path.join(here, "coding-fixture"), workspace, { recursive: true });
console.log(`\nFresh sandbox: ${workspace}`);

function safePath(relative: unknown): string {
  const resolved = path.resolve(workspace, String(relative));
  if (resolved !== workspace && !resolved.startsWith(`${workspace}${path.sep}`)) {
    throw new Error("path escapes sandbox");
  }
  return resolved;
}

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

const tools: DemoTool[] = [
  {
    definition: definition("list_files", "List files in the coding sandbox.", {}, []),
    run: () => fs.readdirSync(workspace).join("\n"),
  },
  {
    definition: definition(
      "read_file",
      "Read a UTF-8 file in the coding sandbox.",
      { path: { type: "string" } },
      ["path"],
    ),
    run: ({ path: file }) => fs.readFileSync(safePath(file), "utf8"),
  },
  {
    definition: definition(
      "write_file",
      "Replace a UTF-8 file in the coding sandbox.",
      { path: { type: "string" }, content: { type: "string" } },
      ["path", "content"],
    ),
    run: ({ path: file, content }) => {
      fs.writeFileSync(safePath(file), String(content));
      return `wrote ${String(file)}`;
    },
  },
  {
    definition: definition("run_tests", "Run the sandbox's Node test suite.", {}, []),
    run: () => {
      try {
        return execFileSync(process.execPath, ["--test"], {
          cwd: workspace,
          encoding: "utf8",
          timeout: 10_000,
        });
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        return `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`.trim();
      }
    },
  },
];

const response = await runAgent({
  prompt: "Fix the failing tests. Inspect the project, run tests, edit the implementation, and verify the fix.",
  instructions: "Work autonomously. Do not claim success until run_tests passes.",
  tools,
  maxSteps: 10,
});
printAnswer(response);
console.log(`\nFinal implementation:\n${fs.readFileSync(path.join(workspace, "slug.js"), "utf8")}`);
