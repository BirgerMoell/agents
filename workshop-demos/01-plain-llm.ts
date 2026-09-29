import { arg, printAnswer, runAgent } from "./lib/runtime.js";

const prompt = arg("Question", "What happened in AI yesterday? Be specific and cite sources.");
printAnswer(await runAgent({ prompt, trace: false }));
