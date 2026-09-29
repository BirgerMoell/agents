import { arg, printAnswer, runAgent } from "./lib/runtime.js";
import { createWebResearch } from "./lib/web-research.js";

const prompt = arg("Question", "What happened in AI yesterday? Be specific and cite sources.");
const research = createWebResearch();

printAnswer(await runAgent({
  prompt,
  instructions: [
    "You have web-search tools, but you do not have a clock or a reliable current date.",
    "For recent-news questions, infer the requested date range yourself and pass explicit YYYY-MM-DD dates to search_web.",
    "You must call search_web, then call open_web_page with at least one returned result_id before answering.",
    "Search snippets are discovery leads, not evidence. Base factual claims only on opened page content.",
    "Only cite exact URLs returned by open_web_page. Never construct, autocomplete, or alter a URL.",
    "If you are unsure which calendar date a relative term means, state the date you assumed.",
  ].join(" "),
  tools: research.tools,
  maxSteps: 8,
  validateAnswer: research.validateAnswer,
}));

console.log(`  audit   searched ${research.searchedUrls.size} URL(s); opened ${research.openedUrls.size} page(s).`);
