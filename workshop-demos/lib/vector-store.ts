import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openai } from "./runtime.js";

export const embeddingModel = process.env.LOCAL_EMBEDDING_MODEL ?? "embeddinggemma";

export type SourceChunk = {
  sourceFile: string;
  sourceUrl: string;
  heading: string;
  content: string;
};

export type SearchHit = SourceChunk & { score: number };

export async function embed(input: string[]): Promise<number[][]> {
  const response = await openai().embeddings.create({
    model: embeddingModel,
    input,
    encoding_format: "float",
  });
  return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

export function readSourceChunks(sourceDir: string): SourceChunk[] {
  return fs.readdirSync(sourceDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .flatMap((sourceFile) => chunkMarkdown(sourceFile, fs.readFileSync(path.join(sourceDir, sourceFile), "utf8")));
}

export function createVectorDatabase(dbPath: string, chunks: SourceChunk[], vectors: number[][]): void {
  if (chunks.length !== vectors.length) throw new Error("Chunk/vector count mismatch.");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    DROP TABLE IF EXISTS chunks;
    DROP TABLE IF EXISTS metadata;
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE chunks (
      id INTEGER PRIMARY KEY,
      source_file TEXT NOT NULL,
      source_url TEXT NOT NULL,
      heading TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB NOT NULL
    );
  `);
  const insert = db.prepare(
    "INSERT INTO chunks (source_file, source_url, heading, content, embedding) VALUES (?, ?, ?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    chunks.forEach((chunk, index) => {
      insert.run(chunk.sourceFile, chunk.sourceUrl, chunk.heading, chunk.content, vectorToBuffer(vectors[index]));
    });
    db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run("embedding_model", embeddingModel);
    db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run("created_at", new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

export function searchVectorDatabase(dbPath: string, queryVector: number[], limit = 4): SearchHit[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare(
      "SELECT source_file, source_url, heading, content, embedding FROM chunks",
    ).all() as Array<{
      source_file: string;
      source_url: string;
      heading: string;
      content: string;
      embedding: Uint8Array;
    }>;
    return rows.map((row) => ({
      sourceFile: row.source_file,
      sourceUrl: row.source_url,
      heading: row.heading,
      content: row.content,
      score: cosineSimilarity(queryVector, bufferToVector(row.embedding)),
    })).sort((a, b) => b.score - a.score).slice(0, limit);
  } finally {
    db.close();
  }
}

function chunkMarkdown(sourceFile: string, markdown: string): SourceChunk[] {
  const sourceUrl = markdown.match(/^Source:\s*(https?:\/\/\S+)/m)?.[1];
  if (!sourceUrl) throw new Error(`${sourceFile} is missing a Source URL.`);
  const sections = markdown.split(/\n(?=## )/);
  const title = markdown.match(/^#\s+(.+)$/m)?.[1] ?? sourceFile;
  return sections.map((section, index) => {
    const heading = section.match(/^##\s+(.+)$/m)?.[1] ?? title;
    const content = section
      .replace(/^#.*$/gm, "")
      .replace(/^Source:.*$/gm, "")
      .replace(/^Retrieved:.*$/gm, "")
      .trim();
    return { sourceFile, sourceUrl, heading: index === 0 ? title : heading, content };
  }).filter((chunk) => chunk.content.length > 0);
}

function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function bufferToVector(value: Uint8Array): Float32Array {
  const copy = Uint8Array.from(value);
  return new Float32Array(copy.buffer);
}

function cosineSimilarity(a: number[], b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}
