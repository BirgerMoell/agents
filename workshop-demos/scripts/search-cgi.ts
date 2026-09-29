import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { embed, searchVectorDatabase } from "../lib/vector-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(here, "..", "knowledge", "cgi-vectors.sqlite");
const query = process.argv.slice(2).join(" ").trim() || "How does CGI approach responsible AI?";
const [queryVector] = await embed([query]);
const hits = searchVectorDatabase(dbPath, queryVector, 5);

console.log(`Query: ${query}\n`);
for (const [index, hit] of hits.entries()) {
  console.log(`${index + 1}. ${hit.heading} (${hit.score.toFixed(3)})`);
  console.log(`   ${hit.sourceFile}`);
  console.log(`   ${hit.sourceUrl}\n`);
}
