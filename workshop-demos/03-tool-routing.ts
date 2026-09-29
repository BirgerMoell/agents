import { arg, printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";

function tool(
  name: string,
  description: string,
  properties: Record<string, object>,
  required: string[],
  run: DemoTool["run"],
): DemoTool {
  const definition: FunctionDefinition = {
    type: "function",
    name,
    description,
    strict: true,
    parameters: { type: "object", properties, required, additionalProperties: false },
  };
  return { definition, run };
}

const calculate = tool(
  "calculate",
  "Evaluate a basic arithmetic expression.",
  { expression: { type: "string", description: "Numbers and +, -, *, /, parentheses only." } },
  ["expression"],
  ({ expression }) => {
    const value = String(expression);
    if (!/^[\d\s+*/().-]+$/.test(value)) return "error: unsupported expression";
    // The allowlist above keeps this workshop evaluator deliberately narrow.
    return String(Function(`"use strict"; return (${value})`)());
  },
);

const getTime = tool(
  "get_current_time",
  "Get the current time in an IANA timezone.",
  { timezone: { type: "string", description: "For example Asia/Tokyo or Europe/Stockholm." } },
  ["timezone"],
  ({ timezone }) => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: String(timezone),
      }).format(new Date());
    } catch {
      return "error: invalid timezone";
    }
  },
);

const lookupRelease = tool(
  "lookup_release_notes",
  "Look up a product in a tiny, intentionally local release-note database.",
  { product: { type: "string" } },
  ["product"],
  ({ product }) => {
    const records: Record<string, string> = {
      "workshop-agent": "Workshop Agent 1.0 was released on 2026-09-20.",
      "demo-kit": "Demo Kit 2.1 was released on 2026-08-14.",
    };
    return records[String(product).toLowerCase()] ?? "No matching release found.";
  },
);

const prompt = arg(
  "Question",
  "What is 142 × 721, and what time is it now in Tokyo? Use the appropriate tools.",
);
printAnswer(await runAgent({ prompt, tools: [calculate, getTime, lookupRelease] }));
