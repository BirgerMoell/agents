import "dotenv/config";
import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

export const model = process.env.LOCAL_LLM_MODEL ?? "gpt-oss:20b";
export const baseURL = process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:11434/v1";

export function openai(): OpenAI {
  return new OpenAI({
    baseURL,
    apiKey: process.env.LOCAL_LLM_API_KEY ?? "ollama",
  });
}

export type FunctionDefinition = {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: {
    type: "object";
    properties: Record<string, object>;
    required: string[];
    additionalProperties: false;
  };
};

export type DemoTool = {
  definition: FunctionDefinition;
  run: (args: Record<string, unknown>) => string | Promise<string>;
};

export type AgentOptions = {
  prompt: string;
  instructions?: string;
  tools?: DemoTool[];
  maxSteps?: number;
  trace?: boolean;
};

export type AgentResult = {
  output_text: string;
  tool_calls: number;
};

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const client = openai();
  const functions = options.tools ?? [];
  const tools: ChatCompletionTool[] = functions.map(({ definition }) => ({
    type: "function",
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      strict: definition.strict,
    },
  }));
  const messages: ChatCompletionMessageParam[] = [];
  if (options.instructions) messages.push({ role: "system", content: options.instructions });
  messages.push({ role: "user", content: options.prompt });

  let totalCalls = 0;
  const maxSteps = options.maxSteps ?? 8;
  for (let step = 1; step <= maxSteps; step += 1) {
    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        reasoning_effort: "low",
      });
    } catch (error) {
      throw localConnectionError(error);
    }

    const message = completion.choices[0]?.message;
    if (!message) throw new Error("The local model returned no message.");
    const calls = (message.tool_calls ?? []).filter(
      (call): call is ChatCompletionMessageFunctionToolCall => call.type === "function",
    );
    if (calls.length === 0) {
      return { output_text: message.content ?? "", tool_calls: totalCalls };
    }

    totalCalls += calls.length;
    const assistantMessage: ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: message.content,
      tool_calls: calls,
    };
    messages.push(assistantMessage);

    for (const call of calls) {
      const tool = functions.find((candidate) => candidate.definition.name === call.function.name);
      if (!tool) throw new Error(`No implementation for tool: ${call.function.name}`);
      const args = sanitizeArguments(
        parseArguments(call.function.arguments),
        tool.definition.parameters.properties,
      );
      if (options.trace !== false) {
        console.log(`\n  LLM -> ${call.function.name}(${JSON.stringify(args)})`);
      }
      const result = await tool.run(args);
      if (options.trace !== false) {
        console.log(`  tool -> ${truncate(result, 500)}`);
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  throw new Error(`Agent exceeded ${maxSteps} tool-call steps.`);
}

export function printAnswer(result: AgentResult): void {
  console.log(`\nAnswer:\n${result.output_text || "(no text response)"}`);
}

export function arg(name: string, fallback: string): string {
  const value = process.argv.slice(2).join(" ").trim();
  console.log(`\n${name}: ${value || fallback}`);
  return value || fallback;
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sanitizeArguments(
  args: Record<string, unknown>,
  properties: Record<string, object>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([name]) => name in properties));
}

function truncate(value: string, length: number): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > length ? `${oneLine.slice(0, length)}...` : oneLine;
}

function localConnectionError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/connect|fetch failed|ECONNREFUSED/i.test(message)) {
    return new Error(
      `Cannot reach Ollama at ${baseURL}. Run \"npm run setup:local\" or start it with \"ollama serve\".`,
    );
  }
  if (/not found|model/i.test(message)) {
    return new Error(
      `Local model ${model} is unavailable. Run \"ollama pull ${model}\" or \"npm run setup:local\".`,
    );
  }
  return error instanceof Error ? error : new Error(message);
}
