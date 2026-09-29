import test from "node:test";
import assert from "node:assert/strict";
import { createWebResearch } from "./web-research.js";

test("open_web_page rejects an unknown search result id", async () => {
  const research = createWebResearch();
  const openTool = research.tools.find((tool) => tool.definition.name === "open_web_page");
  assert.ok(openTool);

  const output = JSON.parse(await openTool.run({
    result_id: "result_99",
  })) as { kind: string; message: string };

  assert.equal(output.kind, "error");
  assert.match(output.message, /unknown result_id/i);
});

test("answer validation accepts common Unicode citation brackets", () => {
  const research = createWebResearch();
  const url = "https://www.example.com/news/item";
  research.openedUrls.add(url);
  const issue = research.validateAnswer(`Verified report 【${url}】`);
  assert.equal(issue, null);
});

test("answer validation accepts a Markdown link whose label is the URL", () => {
  const research = createWebResearch();
  const url = "https://tech-insider.org/waters-demands-openai-probe-ai-moratorium-2026";
  research.openedUrls.add(url);
  const issue = research.validateAnswer(`[${url}](${url})`);
  assert.equal(issue, null);
});

test("answer validation rejects citations that were never opened", () => {
  const research = createWebResearch();
  const issue = research.validateAnswer(
    "OpenAI announced Nova. https://openai.com/blog/gpt5-nova",
  );
  assert.match(issue ?? "", /no source page was opened/i);
});
