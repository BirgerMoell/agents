import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { arg, printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";
import { embed, searchVectorDatabase } from "./lib/vector-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(here, "knowledge", "cgi-vectors.sqlite");

if (!fs.existsSync(dbPath)) {
  throw new Error('CGI vector database not found. Run "npm run index:cgi" first.');
}

const definition: FunctionDefinition = {
  type: "function",
  name: "search_cgi_knowledge",
  description: "Semantically search the local CGI knowledge base and return grounded excerpts with source URLs.",
  strict: true,
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "The information to retrieve about CGI." } },
    required: ["query"],
    additionalProperties: false,
  },
};

const searchCgiKnowledge: DemoTool = {
  definition,
  run: async ({ query }) => {
    const [queryVector] = await embed([String(query)]);
    const hits = searchVectorDatabase(dbPath, queryVector, 4);
    return hits.map((hit, index) => [
      `[Result ${index + 1} | similarity ${hit.score.toFixed(3)}]`,
      `Document: ${hit.sourceFile}`,
      `Section: ${hit.heading}`,
      `Source: ${hit.sourceUrl}`,
      hit.content,
    ].join("\n")).join("\n\n");
  },
};

const prompt = arg(
  "Question",
  "What are CGI's three pillars of Responsible AI, and how does its Swedish AI-agent framework put those ideas into practice? Cite the source URLs.",
);
printAnswer(await runAgent({
  prompt,
  instructions: [
    "Answer only from search_cgi_knowledge results.",
    "Call the search tool before answering, and search again if the first results are insufficient.",
    "Cite sources by writing the exact supplied CGI URL in parentheses next to each claim; do not use numbered footnotes.",
    "If the database does not contain the answer, say so instead of using prior knowledge.",
  ].join(" "),
  tools: [searchCgiKnowledge],
}));
