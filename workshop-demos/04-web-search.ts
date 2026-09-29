import { arg, printAnswer, runAgent, type DemoTool, type FunctionDefinition } from "./lib/runtime.js";

const definition: FunctionDefinition = {
  type: "function",
  name: "search_web",
  description: "Search the public web for up-to-date information and return titles, URLs, and snippets.",
  strict: true,
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "A concise web search query." } },
    required: ["query"],
    additionalProperties: false,
  },
};

const searchWeb: DemoTool = {
  definition,
  run: async ({ query }) => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(query))}`;
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; AgentWorkshop/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return `error: web search returned HTTP ${response.status}`;
    const html = await response.text();
    const results: string[] = [];
    const pattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g;
    for (const match of html.matchAll(pattern)) {
      const target = decodeRedirect(decodeHtml(match[1]));
      const title = stripHtml(match[2]);
      const snippet = stripHtml(match[3]);
      results.push(`${title}\n${target}\n${snippet}`);
      if (results.length === 5) break;
    }
    return results.length > 0 ? results.join("\n\n") : "No search results found.";
  },
};

function decodeRedirect(value: string): string {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    return url.searchParams.get("uddg") ?? url.toString();
  } catch {
    return value;
  }
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const prompt = arg(
  "Question",
  "Find one important AI announcement published from 2026-09-20 through 2026-09-27. Summarize it and cite the source URL.",
);
printAnswer(await runAgent({
  prompt,
  instructions: [
    "Today is 2026-09-27.",
    "Use search_web before answering and include the date range in your search query.",
    "Prefer a primary source and include its URL.",
    "Only claim an announcement is in range when the search evidence explicitly shows a publication date from 2026-09-20 through 2026-09-27.",
    "If the results do not prove that, say the evidence is insufficient instead of guessing a date.",
  ].join(" "),
  tools: [searchWeb],
}));
