import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import OpenAI from "openai";
import { toolDefinitions, runTool, type ToolName } from "./tools.js";
import { buildAvailableSkillsXml } from "./skills.js";

import * as dotenv from "dotenv";
dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in .env file");
}

const client = new OpenAI();

const SYSTEM = (() => {
  const base =
    "You are Polymath, an AI agent who knows everything. You have strong tools: use ping for reachability; bash for shell commands; read_file to read project files; list_dir to explore directories; fetch_url to GET web pages; search_files to grep the codebase. For Agent Skills: use list_skills to see installed skills; when a task matches a skill's description, use load_skill to load its instructions, then follow them and use read_skill_file for any referenced scripts or references.";
  const skillsXml = buildAvailableSkillsXml();
  return skillsXml ? `${base}\n\n${skillsXml}` : base;
})();

async function chat(
  inputMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  previousResponseId?: string | null
): Promise<OpenAI.Responses.Response> {
  const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: "gpt-5.2",
    instructions: SYSTEM,
    input: inputMessages as OpenAI.Responses.EasyInputMessage[],
    tools: toolDefinitions,
    store: true,
  };
  if (previousResponseId) {
    params.previous_response_id = previousResponseId;
    params.input = inputMessages as OpenAI.Responses.ResponseInputItem[];
  }
  const response = await client.responses.create(params);
  return response as OpenAI.Responses.Response;
}

function getToolCalls(
  response: OpenAI.Responses.Response
): OpenAI.Responses.ResponseFunctionToolCall[] {
  const out = response.output ?? [];
  return out.filter(
    (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
      "type" in item && item.type === "function_call"
  );
}

function getOutputText(response: OpenAI.Responses.Response): string {
  if (response.output_text) return response.output_text;
  const out = response.output ?? [];
  for (const item of out) {
    if ("content" in item && Array.isArray(item.content)) {
      for (const part of item.content) {
        if ("text" in part && typeof part.text === "string") return part.text;
      }
    }
  }
  return "";
}

async function turn(
  userLine: string,
  previousResponseId?: string | null
): Promise<{ response: OpenAI.Responses.Response; lastId: string | null }> {
  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "user", content: userLine },
  ];

  let response = await chat(
    previousResponseId ? [messages[0]] : messages,
    previousResponseId
  );
  let lastId: string | null = response.id ?? null;

  // Handle tool calls: run tools, then continue with tool outputs until we get text.
  for (;;) {
    const toolCalls = getToolCalls(response);
    if (toolCalls.length === 0) break;

    const toolOutputs: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] =
      toolCalls.map((call) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments ?? "{}");
        } catch {
          args = {};
        }
        const result = runTool(
          call.name as ToolName,
          args
        );
        return {
          type: "function_call_output",
          call_id: call.call_id,
          output: result,
        };
      });

    response = await client.responses.create({
      model: "gpt-5.2",
      instructions: SYSTEM,
      previous_response_id: lastId,
      input: toolOutputs,
      tools: toolDefinitions,
      store: true,
    });
    lastId = response.id ?? lastId;
  }

  return { response, lastId };
}

async function main() {
  const rl = readline.createInterface({ input, output });
  console.log("Polymath — type a message and press Enter (Ctrl+C to exit).\n");

  let previousResponseId: string | null = null;

  for (;;) {
    const line = await rl.question("You: ");
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const { response, lastId } = await turn(trimmed, previousResponseId);
      previousResponseId = lastId;
      const text = getOutputText(response);
      if (text) console.log("\nPolymath:", text, "\n");
    } catch (err) {
      console.error("Error:", (err as Error).message);
    }
  }
}

main();
