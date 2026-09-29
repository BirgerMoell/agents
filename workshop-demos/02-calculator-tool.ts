import { arg, printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";

const definition: FunctionDefinition = {
  type: "function",
  name: "calculate_training_cost",
  description: "Calculate a training run's total cost from hourly price, GPU count, and duration.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      euros_per_gpu_hour: { type: "number" },
      gpu_count: { type: "integer" },
      days: { type: "number" },
    },
    required: ["euros_per_gpu_hour", "gpu_count", "days"],
    additionalProperties: false,
  },
};

const calculator: DemoTool = {
  definition,
  run: (args) => {
    const price = Number(args.euros_per_gpu_hour);
    const gpus = Number(args.gpu_count);
    const days = Number(args.days);
    const total = price * gpus * days * 24;
    return JSON.stringify({
      duration_hours: days * 24,
      total_gpu_hours: days * 24 * gpus,
      total_euros: Math.round(total * 100) / 100,
    });
  },
};

const prompt = arg(
  "Question",
  "Training costs €2.30 per GPU-hour. What does a run with 512 GPUs for 17 days cost?",
);
printAnswer(await runAgent({ prompt, tools: [calculator] }));
