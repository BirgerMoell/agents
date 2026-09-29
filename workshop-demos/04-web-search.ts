import { arg, printAnswer, runAgent } from "./lib/runtime.js";
import { createWebResearch } from "./lib/web-research.js";

const today = new Date();
const start = new Date(today);
start.setUTCDate(start.getUTCDate() - 7);
const endDate = isoDate(today);
const startDate = isoDate(start);
const research = createWebResearch();

const prompt = arg(
  "Question",
  `Find one important AI announcement published from ${startDate} through ${endDate}. ` +
    "Explain what was announced and why it matters, using a primary source if possible.",
);

const result = await runAgent({
  prompt,
  instructions: [
    `Today is ${endDate}.`,
    `For recent-news requests, search only from ${startDate} through ${endDate}.`,
    "You must call search_web, then call open_web_page with at least one returned result_id before answering.",
    "Search snippets are discovery leads, not evidence. Base factual claims only on opened page content.",
    "Only cite exact URLs returned by open_web_page. Never construct, autocomplete, or alter a URL.",
    "Opening a page verifies its contents, not its truth or primary-source status.",
    "Only call a source primary or official when open_web_page classifies it as official-domain.",
    "If a source is secondary-or-unverified, attribute the claims to that publication and qualify them.",
    "A publication date must be present in the evidence and inside the requested range.",
    "If no opened primary source proves a qualifying announcement, say that no verified result was found.",
  ].join(" "),
  tools: research.tools,
  maxSteps: 8,
  validateAnswer: research.validateAnswer,
});
printAnswer(result);

console.log(`  audit   searched ${research.searchedUrls.size} URL(s); opened ${research.openedUrls.size} page(s).`);

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
