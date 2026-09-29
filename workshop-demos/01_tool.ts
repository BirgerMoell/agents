import { arg, printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";
import { createWebResearch } from "./lib/web-research.js";

const definition: FunctionDefinition = {
  type: "function",
  name: "get_current_datetime",
  description: "Get the real current date and time from the computer in an IANA timezone. Use for today, yesterday, now, and other relative dates.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "An IANA timezone such as Europe/Stockholm or Asia/Tokyo.",
      },
    },
    required: ["timezone"],
    additionalProperties: false,
  },
};

const currentTime: DemoTool = {
  definition,
  run: ({ timezone }) => {
    const requestedZone = String(timezone);
    try {
      return JSON.stringify({
        timezone: requestedZone,
        iso_utc: new Date().toISOString(),
        local_datetime: new Intl.DateTimeFormat("en-GB", {
          timeZone: requestedZone,
          dateStyle: "full",
          timeStyle: "long",
        }).format(new Date()),
      });
    } catch {
      return JSON.stringify({ error: "Invalid IANA timezone" });
    }
  },
};

const prompt = arg("Question", "What happened in AI yesterday? Be specific and cite sources.");
const research = createWebResearch();

printAnswer(await runAgent({
  prompt,
  instructions: [
    "Call get_current_datetime before interpreting relative dates such as yesterday.",
    "Use Europe/Stockholm unless the user specifies another timezone.",
    "Derive the exact requested calendar date from the clock result and use it as the explicit search_web date range.",
    "You must call search_web, then call open_web_page with at least one returned result_id before answering.",
    "Search snippets are discovery leads, not evidence. Base factual claims only on opened page content.",
    "Only cite exact URLs returned by open_web_page. Never construct, autocomplete, or alter a URL.",
    "State the exact calendar date used for the search.",
  ].join(" "),
  tools: [currentTime, ...research.tools],
  maxSteps: 9,
  validateAnswer: research.validateAnswer,
}));

console.log(`  audit   searched ${research.searchedUrls.size} URL(s); opened ${research.openedUrls.size} page(s).`);
