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

const colorEnabled = Boolean(
  process.stdout.isTTY && !("NO_COLOR" in process.env) && process.env.TERM !== "dumb",
);
const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function paint(value: string, ...codes: string[]): string {
  return colorEnabled ? `${codes.join("")}${value}${ansi.reset}` : value;
}

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
  streamsProgress?: boolean;
};

export type AgentOptions = {
  prompt: string;
  instructions?: string;
  tools?: DemoTool[];
  maxSteps?: number;
  trace?: boolean;
  validateAnswer?: (answer: string) => string | null;
};

export type AgentResult = {
  output_text: string;
  tool_calls: number;
  streamed: boolean;
};

type PartialToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type StreamedTurn = {
  content: string;
  reasoning: string;
  calls: ChatCompletionMessageFunctionToolCall[];
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

  printSessionHeader(functions);
  let totalCalls = 0;
  const maxSteps = options.maxSteps ?? 8;

  for (let step = 1; step <= maxSteps; step += 1) {
    const label = step === 1
      ? "sending the prompt to the local model"
      : "letting the model inspect the new observations";
    const turn = await streamTurn(
      client,
      messages,
      tools,
      step,
      label,
      options.validateAnswer ? "draft" : "answer",
    );
    if (turn.calls.length === 0) {
      const validationError = options.validateAnswer?.(turn.content) ?? null;
      if (validationError) {
        console.log(paint(`\n\n  guardrail  REJECTED DRAFT: ${validationError}`, ansi.red, ansi.bold));
        messages.push({ role: "assistant", content: turn.content });
        messages.push({
          role: "user",
          content: [
            `Evidence validation rejected the draft: ${validationError}`,
            "Revise it using only opened evidence. If evidence is insufficient, say so plainly.",
            "Do not repeat unsupported claims or citations.",
          ].join(" "),
        });
        continue;
      }
      if (options.validateAnswer) {
        console.log(paint("\n\n  guardrail  ACCEPTED: citations match opened evidence.", ansi.green));
      }
      if (!turn.content) console.log(paint("\n  answer  (no text response)", ansi.green));
      console.log(paint(`\n\n✓ Finished after ${step} model step${step === 1 ? "" : "s"} and ${totalCalls} tool call${totalCalls === 1 ? "" : "s"}.`, ansi.green, ansi.bold));
      return { output_text: turn.content, tool_calls: totalCalls, streamed: true };
    }

    totalCalls += turn.calls.length;
    const assistantMessage: ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: turn.content || null,
      tool_calls: turn.calls,
    };
    messages.push(assistantMessage);

    for (const call of turn.calls) {
      const tool = functions.find((candidate) => candidate.definition.name === call.function.name);
      if (!tool) throw new Error(`No implementation for tool: ${call.function.name}`);
      const args = sanitizeArguments(
        parseArguments(call.function.arguments),
        tool.definition.parameters.properties,
      );
      if (options.trace !== false) {
        console.log(paint(`\n  action  ${call.function.name}(${JSON.stringify(args)})`, ansi.cyan, ansi.bold));
      }
      const toolStarted = Date.now();
      const stopToolProgress = tool.streamsProgress
        ? () => console.log(paint(`  ready    ${call.function.name} completed (${((Date.now() - toolStarted) / 1000).toFixed(1)}s)`, ansi.green))
        : startProgress(`running ${call.function.name}`);
      if (tool.streamsProgress) {
        console.log(paint(`  running  ${call.function.name} (streaming local model output)`, ansi.yellow));
      }
      let result: string;
      try {
        result = await tool.run(args);
      } finally {
        stopToolProgress();
      }
      if (options.trace !== false) {
        console.log(paint(`  result  ${truncate(result, 650)}`, ansi.blue));
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  throw new Error(`Agent exceeded ${maxSteps} tool-call steps.`);
}

async function streamTurn(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  step: number,
  label: string,
  answerLabel: "answer" | "draft",
): Promise<StreamedTurn> {
  const stopProgress = startProgress(`step ${step}: ${label}`, true);
  let progressStopped = false;
  const stopOnce = (): void => {
    if (!progressStopped) {
      stopProgress();
      progressStopped = true;
    }
  };

  let content = "";
  let reasoning = "";
  let phase: "waiting" | "thinking" | "answer" | "tool" = "waiting";
  const partialCalls = new Map<number, PartialToolCall>();

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      reasoning_effort: "low",
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      const extension = delta as typeof delta & {
        reasoning?: string | null;
        reasoning_content?: string | null;
      };
      const reasoningDelta = extension.reasoning ?? extension.reasoning_content ?? "";

      if (reasoningDelta) {
        stopOnce();
        reasoning += reasoningDelta;
        if (process.env.DEMO_SHOW_REASONING !== "false") {
          if (phase !== "thinking") {
            process.stdout.write(`${phase === "waiting" ? "\n" : "\n\n"}${paint("  thinking  ", ansi.magenta, ansi.bold)}`);
            phase = "thinking";
          }
          process.stdout.write(paint(reasoningDelta, ansi.magenta));
        }
      }

      if (delta.content) {
        stopOnce();
        content += delta.content;
        if (phase !== "answer") {
          process.stdout.write(`${phase === "waiting" ? "\n" : "\n\n"}${paint(`  ${answerLabel.padEnd(6)}  `, ansi.green, ansi.bold)}`);
          phase = "answer";
        }
        process.stdout.write(paint(delta.content, ansi.green));
      }

      for (const toolDelta of delta.tool_calls ?? []) {
        stopOnce();
        phase = "tool";
        const current = partialCalls.get(toolDelta.index) ?? { id: "", name: "", arguments: "" };
        if (toolDelta.id) current.id += toolDelta.id;
        if (toolDelta.function?.name) current.name += toolDelta.function.name;
        if (toolDelta.function?.arguments) current.arguments += toolDelta.function.arguments;
        partialCalls.set(toolDelta.index, current);
      }
    }
  } catch (error) {
    throw localConnectionError(error);
  } finally {
    stopOnce();
  }

  const calls = [...partialCalls.entries()].sort(([a], [b]) => a - b).map(([index, call]) => ({
    id: call.id || `call_${step}_${index}`,
    type: "function" as const,
    function: { name: call.name, arguments: call.arguments || "{}" },
  }));
  return { content, reasoning, calls };
}

export function printAnswer(result: AgentResult): void {
  if (!result.streamed) {
    console.log(paint(`\nAnswer:\n${result.output_text || "(no text response)"}`, ansi.green));
  }
}

export function arg(name: string, fallback: string): string {
  const value = process.argv.slice(2).join(" ").trim();
  console.log(`\n${paint(`${name}:`, ansi.blue, ansi.bold)} ${paint(value || fallback, ansi.blue)}`);
  return value || fallback;
}

function printSessionHeader(tools: DemoTool[]): void {
  console.log(paint("\n──────────────── Local agent ────────────────", ansi.blue, ansi.bold));
  console.log(`${paint("  model  ", ansi.dim)} ${model}`);
  console.log(`${paint("  server ", ansi.dim)} ${baseURL}`);
  console.log(`${paint("  tools  ", ansi.dim)} ${tools.length ? tools.map((tool) => tool.definition.name).join(", ") : "none"}`);
  console.log(paint("─────────────────────────────────────────────", ansi.blue, ansi.bold));
}

function startProgress(label: string, modelLoadHint = false): () => void {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const render = (): void => {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (process.stdout.isTTY) {
      process.stdout.write(`\r\x1b[2K${paint(`  waiting  ${label} (${elapsed}s)`, ansi.yellow)}`);
    }
  };
  const hint = modelLoadHint ? " (the first run may load the model)" : "";
  process.stdout.write(`\n${paint(`  waiting  ${label}${hint}`, ansi.yellow)}`);
  if (process.stdout.isTTY) timer = setInterval(render, 250);
  return () => {
    if (timer) clearInterval(timer);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K");
    console.log(paint(`  ready    ${label} (${elapsed}s)`, ansi.green));
  };
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
