import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import OpenAI from "openai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { toolDefinitions, runTool, type ToolName } from "./tools.js";
import { buildAvailableSkillsXml } from "./skills.js";

import * as dotenv from "dotenv";
dotenv.config();

const provider = process.env.AGENT_PROVIDER?.toLowerCase() ?? "ollama";
if (provider !== "ollama" && provider !== "openai") {
  throw new Error("AGENT_PROVIDER must be ollama or openai");
}
if (provider === "openai" && !process.env.OPENAI_API_KEY) {
  throw new Error("Set OPENAI_API_KEY to use AGENT_PROVIDER=openai");
}

const localModel = process.env.LOCAL_LLM_MODEL ?? "gpt-oss:20b";
const localBaseURL = process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:11434/v1";
const openaiModel = process.env.OPENAI_MODEL ?? "gpt-5.2";
const maxToolSteps = 12;

const client = provider === "ollama"
  ? new OpenAI({ baseURL: localBaseURL, apiKey: process.env.LOCAL_LLM_API_KEY ?? "ollama" })
  : new OpenAI();

const SYSTEM = (() => {
  const base =
    "You are Polymath, a helpful AI agent. You have strong tools: use ping for reachability; bash for shell commands; read_file to read project files; list_dir to explore directories; fetch_url to GET web pages; search_files to grep the codebase. For Agent Skills: use list_skills to see installed skills; when a task matches a skill's description, use load_skill to load its instructions, then follow them and use read_skill_file for any referenced scripts or references. Never claim a tool succeeded without checking its result.";
  const skillsXml = buildAvailableSkillsXml();
  return skillsXml ? `${base}\n\n${skillsXml}` : base;
})();

const localTools: ChatCompletionTool[] = toolDefinitions.map((tool) => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description ?? undefined,
    parameters: tool.parameters ?? undefined,
  },
}));

function executeTool(name: string, argumentsJson: string): string {
  if (!toolDefinitions.some((tool) => tool.name === name)) {
    return `error: unknown tool "${name}"`;
  }
  try {
    const args: unknown = JSON.parse(argumentsJson || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return "error: tool arguments must be a JSON object";
    }
    return runTool(name as ToolName, args as Record<string, unknown>);
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function streamLocalStep(
  history: ChatCompletionMessageParam[],
): Promise<{ content: string; calls: ChatCompletionMessageFunctionToolCall[] }> {
  const stream = await client.chat.completions.create({
    model: localModel,
    messages: history,
    tools: localTools,
    tool_choice: "auto",
    stream: true,
  });
  const partialCalls = new Map<number, { id: string; name: string; arguments: string }>();
  let content = "";
  let printed = false;

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        if (!printed) {
          process.stdout.write("\nPolymath: ");
          printed = true;
        }
        content += delta.content;
        process.stdout.write(delta.content);
      }

      for (const toolDelta of delta.tool_calls ?? []) {
        const call = partialCalls.get(toolDelta.index) ?? { id: "", name: "", arguments: "" };
        if (toolDelta.id) call.id = toolDelta.id;
        if (toolDelta.function?.name) call.name += toolDelta.function.name;
        if (toolDelta.function?.arguments) call.arguments += toolDelta.function.arguments;
        partialCalls.set(toolDelta.index, call);
      }
    }
  } finally {
    if (printed) process.stdout.write("\n");
  }

  const calls = [...partialCalls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, call]) => ({
      id: call.id || `local_call_${index}`,
      type: "function" as const,
      function: { name: call.name, arguments: call.arguments || "{}" },
    }));
  return { content, calls };
}

async function localTurn(history: ChatCompletionMessageParam[], userLine: string): Promise<string> {
  const priorLength = history.length;
  history.push({ role: "user", content: userLine });

  try {
    for (let step = 0; step < maxToolSteps; step += 1) {
      const { content, calls } = await streamLocalStep(history);
      if (calls.length === 0) {
        const answer = content.trim();
        if (!answer) throw new Error("The local model returned an empty answer");
        history.push({ role: "assistant", content: answer });
        return answer;
      }

      history.push({ role: "assistant", content: content || null, tool_calls: calls });
      for (const call of calls) {
        const result = executeTool(call.function.name, call.function.arguments);
        console.log(`  ${call.function.name}(${call.function.arguments})`);
        history.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
    throw new Error(`The model exceeded ${maxToolSteps} tool steps`);
  } catch (error) {
    history.length = priorLength;
    throw error;
  }
}

async function openaiTurn(
  userLine: string,
  previousResponseId?: string | null,
): Promise<{ text: string; lastId: string | null }> {
  let response = await client.responses.create({
    model: openaiModel,
    instructions: SYSTEM,
    input: [{ role: "user", content: userLine }],
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    tools: toolDefinitions,
    store: true,
  });

  for (let step = 0; step < maxToolSteps; step += 1) {
    const calls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
    );
    if (calls.length === 0) {
      return { text: response.output_text, lastId: response.id ?? null };
    }

    const toolOutputs: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] = calls.map(
      (call) => {
        const result = executeTool(call.name, call.arguments);
        console.log(`  ${call.name}(${call.arguments})`);
        return { type: "function_call_output", call_id: call.call_id, output: result };
      },
    );
    response = await client.responses.create({
      model: openaiModel,
      instructions: SYSTEM,
      previous_response_id: response.id,
      input: toolOutputs,
      tools: toolDefinitions,
      store: true,
    });
  }
  throw new Error(`The model exceeded ${maxToolSteps} tool steps`);
}

async function main() {
  const rl = readline.createInterface({ input, output });
  const model = provider === "ollama" ? localModel : openaiModel;
  console.log(`Polymath — ${provider} / ${model} (Ctrl+C to exit).\n`);

  const history: ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM }];
  let previousResponseId: string | null = null;

  try {
    for (;;) {
      const line = await rl.question("You: ");
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        if (provider === "ollama") {
          await localTurn(history, trimmed);
          console.log();
        } else {
          const result = await openaiTurn(trimmed, previousResponseId);
          previousResponseId = result.lastId;
          if (result.text) console.log("\nPolymath:", result.text, "\n");
        }
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) throw error;
    console.log("\nGoodbye.");
  } finally {
    rl.close();
  }
}

main();
