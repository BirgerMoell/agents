import { arg, printAnswer, runAgent } from "./lib/runtime.js";
import { createWebResearch } from "./lib/web-research.js";

const prompt = arg("Question", "What is the meaning of life?");
const research = createWebResearch();

printAnswer(await runAgent({
  prompt,
  instructions: [
    "Please answer the user question based on all your knowledge, be concise.",
  ].join(" "),
  tools: [
  ],
  maxSteps: 8,
}));

console.log(`  audit   searched ${research.searchedUrls.size} URL(s); opened ${research.openedUrls.size} page(s).`);
