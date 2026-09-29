import { tavily, TavilyKeylessLimitError } from "@tavily/core";
import type { DemoTool, FunctionDefinition } from "./runtime.js";

type SearchEvidence = {
  title: string;
  url: string;
  excerpt: string;
  publishedDate: string;
  score: number;
};

export type WebResearch = {
  tools: DemoTool[];
  searchedUrls: Set<string>;
  openedUrls: Set<string>;
  validateAnswer: (answer: string) => string | null;
};

const knownOfficialHosts = [
  "openai.com",
  "anthropic.com",
  "deepmind.google",
  "blog.google",
  "microsoft.com",
  "nvidia.com",
  "meta.com",
  "about.fb.com",
  "amazon.com",
  "aws.amazon.com",
  "apple.com",
  "huggingface.co",
  "arxiv.org",
];

const searchDefinition: FunctionDefinition = {
  type: "function",
  name: "search_web",
  description: "Search a real web index for pages in an explicit date range. Results are leads, not yet verified evidence: call open_web_page before citing one.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "A concise search query." },
      start_date: { type: "string", description: "Inclusive start date in YYYY-MM-DD format." },
      end_date: { type: "string", description: "Inclusive end date in YYYY-MM-DD format." },
    },
    required: ["query", "start_date", "end_date"],
    additionalProperties: false,
  },
};

const openDefinition: FunctionDefinition = {
  type: "function",
  name: "open_web_page",
  description: "Extract the full readable content of a search result using its short result_id.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      result_id: { type: "string", description: "The result_id returned by search_web, such as result_1." },
    },
    required: ["result_id"],
    additionalProperties: false,
  },
};

export function createWebResearch(): WebResearch {
  const client = tavily(process.env.TAVILY_API_KEY
    ? { apiKey: process.env.TAVILY_API_KEY, clientName: "local-agent-workshop" }
    : { clientName: "local-agent-workshop" });
  const evidenceById = new Map<string, SearchEvidence>();
  const searchedUrls = new Set<string>();
  const openedUrls = new Set<string>();

  const searchTool: DemoTool = {
    definition: searchDefinition,
    run: async ({ query, start_date: startDate, end_date: endDate }) => {
      const queryText = String(query).trim();
      const start = String(startDate);
      const end = String(endDate);
      if (!queryText) return errorResult("query must not be empty");
      if (!isIsoDate(start) || !isIsoDate(end)) {
        return errorResult("start_date and end_date must use YYYY-MM-DD");
      }
      if (start > end) return errorResult("start_date must be on or before end_date");

      try {
        // Tavily rejects identical start/end dates. Expand only the provider query,
        // then filter its results back to the exact range requested by the model.
        const providerStart = start === end ? previousIsoDate(start) : start;
        const response = await client.search(queryText, {
          topic: "news",
          searchDepth: "advanced",
          maxResults: 6,
          startDate: providerStart,
          endDate: end,
          includeRawContent: false,
          includeAnswer: false,
          timeout: 20,
        });
        const results = response.results.flatMap((result) => {
          if (!dateIsInRange(result.publishedDate, start, end)) return [];
          const item: SearchEvidence = {
            title: result.title,
            url: result.url,
            excerpt: result.content,
            publishedDate: result.publishedDate ?? "",
            score: result.score,
          };
          const resultId = `result_${evidenceById.size + 1}`;
          evidenceById.set(resultId, item);
          searchedUrls.add(item.url);
          return [{
            result_id: resultId,
            title: item.title,
            url: item.url,
            published_date: item.publishedDate || null,
            excerpt: item.excerpt,
            relevance: Number(item.score.toFixed(3)),
          }];
        });
        return JSON.stringify({
          kind: "search_results",
          query: response.query,
          requested_date_range: { start, end },
          results,
          next_step: "Call open_web_page with a result_id before making or citing claims.",
        });
      } catch (error) {
        return providerError(error);
      }
    },
  };

  const openTool: DemoTool = {
    definition: openDefinition,
    run: async ({ result_id: resultId }) => {
      const requested = String(resultId);
      const found = evidenceById.get(requested);
      if (!found) {
        return errorResult(
          "Unknown result_id. Search first, then pass a result_id exactly as returned by search_web.",
        );
      }

      try {
        const response = await client.extract([found.url], {
          extractDepth: "advanced",
          format: "markdown",
          query: `publication date and factual details for ${found.title}`,
          chunksPerSource: 5,
          timeout: 20,
        });
        const page = response.results[0];
        if (!page) {
          const failure = response.failedResults[0]?.error ?? "the provider returned no page content";
          return errorResult(`Could not open searched URL: ${failure}`);
        }
        openedUrls.add(found.url);
        const officialDomain = isKnownOfficialDomain(found.url);
        return JSON.stringify({
          kind: "opened_page",
          title: page.title ?? found.title,
          url: found.url,
          search_result_published_date: found.publishedDate || null,
          source_classification: officialDomain
            ? "official-domain"
            : "secondary-or-unverified",
          verification_warning: officialDomain
            ? "This URL is on a known official domain, but claims must still match the extracted content."
            : "Opening confirms what this page says; it does not make the page a primary source or independently prove its claims.",
          content: truncate(page.rawContent, 12_000),
          citation_rule: "Cite exactly the URL in this object. Do not invent or alter it.",
        });
      } catch (error) {
        return providerError(error);
      }
    },
  };

  const validateAnswer = (answer: string): string | null => {
    if (openedUrls.size === 0) return "no source page was opened";
    const citedUrls = extractUrls(answer);
    if (citedUrls.length === 0) return "the draft contains no source URL";
    const normalizedOpened = new Set([...openedUrls].map(normalizeUrl));
    const unopened = citedUrls.find((url) => !normalizedOpened.has(normalizeUrl(url)));
    if (unopened) return `citation was not opened: ${unopened}`;
    if (/\b(primary source|official source|official announcement)\b/i.test(answer)) {
      const hasOfficialCitation = citedUrls.some(isKnownOfficialDomain);
      if (!hasOfficialCitation) {
        return "the draft calls a source primary/official, but no cited URL is on a recognized official domain";
      }
    }
    return null;
  };

  return { tools: [searchTool, openTool], searchedUrls, openedUrls, validateAnswer };
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim();
  }
}

function extractUrls(value: string): string[] {
  return value.match(/https?:\/\/[^\s<>\])】」』》]+/gu)?.map(cleanCitationUrl) ?? [];
}

function cleanCitationUrl(value: string): string {
  return value.replace(/[.,;:!?)\]}>】」』》]+$/gu, "");
}

function previousIsoDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dateIsInRange(value: string | undefined, start: string, end: string): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  const published = new Date(timestamp).toISOString().slice(0, 10);
  return published >= start && published <= end;
}

function isKnownOfficialDomain(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return knownOfficialHosts.some((official) => host === official || host.endsWith(`.${official}`));
  } catch {
    return false;
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function errorResult(message: string): string {
  return JSON.stringify({ kind: "error", message });
}

function providerError(error: unknown): string {
  if (error instanceof TavilyKeylessLimitError) {
    return errorResult(
      `Tavily keyless rate limit reached. Set TAVILY_API_KEY and retry. Retry after: ${error.retryAfter ?? "unknown"}.`,
    );
  }
  return errorResult(error instanceof Error ? error.message : String(error));
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}\n[content truncated]` : value;
}
