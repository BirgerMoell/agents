import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createVectorDatabase, embed, embeddingModel, readSourceChunks } from "../lib/vector-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const sourceDir = path.join(root, "knowledge", "cgi");
const dbPath = path.join(root, "knowledge", "cgi-vectors.sqlite");
const chunks = readSourceChunks(sourceDir);

console.log(`Embedding ${chunks.length} CGI knowledge chunks with ${embeddingModel}...`);
const vectors = await embed(chunks.map((chunk) => `${chunk.heading}\n${chunk.content}`));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
createVectorDatabase(dbPath, chunks, vectors);
console.log(`Wrote ${vectors.length} vectors to ${dbPath}`);
