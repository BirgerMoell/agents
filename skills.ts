/**
 * Agent Skills integration (https://agentskills.io).
 * Discovers skills from a directory (default .skills), parses SKILL.md frontmatter,
 * and provides metadata + full content for injection into the agent.
 */
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const WORKSPACE = process.cwd();

/** Directory containing skill folders. Default .skills in workspace; override with SKILLS_DIR env. */
export function getSkillsDir(): string {
  const env = process.env.SKILLS_DIR;
  if (env) {
    const resolved = path.isAbsolute(env) ? env : path.resolve(WORKSPACE, env);
    return resolved;
  }
  return path.join(WORKSPACE, ".skills");
}

export interface SkillMetadata {
  name: string;
  description: string;
  /** Absolute path to SKILL.md (for load_skill / read_file). */
  path: string;
  /** Absolute path to skill directory. */
  dir: string;
}

/** Parse frontmatter from SKILL.md content. Returns metadata or null if invalid. */
function parseSkillFrontmatter(
  skillDir: string,
  skillMdPath: string,
  rawContent: string
): Omit<SkillMetadata, "path"> | null {
  try {
    const parsed = matter(rawContent);
    const data = parsed.data as Record<string, unknown>;
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (!name || !description) return null;
    if (name.length > 64) return null;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return null;
    const dirName = path.basename(skillDir);
    if (name !== dirName) return null;
    return { name, description, dir: skillDir };
  } catch {
    return null;
  }
}

/** Discover all skills in the skills directory. Returns metadata only (lightweight for startup). */
export function discoverSkills(): SkillMetadata[] {
  const skillsDir = getSkillsDir();
  const result: SkillMetadata[] = [];
  try {
    if (!fs.statSync(skillsDir).isDirectory()) return result;
  } catch {
    return result;
  }
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const skillDir = path.join(skillsDir, e.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");
    try {
      if (!fs.statSync(skillMdPath).isFile()) continue;
      const raw = fs.readFileSync(skillMdPath, "utf8");
      const meta = parseSkillFrontmatter(skillDir, skillMdPath, raw);
      if (meta) result.push({ ...meta, path: skillMdPath });
    } catch {
      /* skip unreadable or invalid */
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** Get metadata for a single skill by name, or null if not found. */
export function getSkillMetadata(name: string): SkillMetadata | null {
  const skillsDir = getSkillsDir();
  const skillDir = path.join(skillsDir, name);
  const skillMdPath = path.join(skillDir, "SKILL.md");
  try {
    if (!fs.statSync(skillMdPath).isFile()) return null;
    const raw = fs.readFileSync(skillMdPath, "utf8");
    const meta = parseSkillFrontmatter(skillDir, skillMdPath, raw);
    return meta ? { ...meta, path: skillMdPath } : null;
  } catch {
    return null;
  }
}

/** Load full SKILL.md content (frontmatter + body) for activation. Returns null if skill not found. */
export function getSkillContent(name: string): string | null {
  const meta = getSkillMetadata(name);
  if (!meta) return null;
  try {
    return fs.readFileSync(meta.path, "utf8");
  } catch {
    return null;
  }
}

/** Resolve a path relative to a skill's directory (e.g. references/REFERENCE.md). Must stay inside the skill. */
export function resolveSkillPath(skillName: string, relativePath: string): string | null {
  const meta = getSkillMetadata(skillName);
  if (!meta) return null;
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = path.resolve(meta.dir, normalized);
  if (!resolved.startsWith(meta.dir)) return null;
  return resolved;
}

/** Read a file inside a skill (scripts/, references/, assets/). Returns content or error string. */
export function readSkillFile(skillName: string, relativePath: string): string {
  const resolved = resolveSkillPath(skillName, relativePath);
  if (!resolved) return "error: skill not found or path outside skill directory";
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return "error: not a file";
    return fs.readFileSync(resolved, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return "error: file not found";
    return `error: ${err.message ?? String(e)}`;
  }
}

/** List files in a skill's optional dirs (scripts, references, assets). Returns newline-separated relative paths. */
export function listSkillFiles(skillName: string): string {
  const meta = getSkillMetadata(skillName);
  if (!meta) return "error: skill not found";
  const dirs = ["scripts", "references", "assets"];
  const lines: string[] = [];
  for (const d of dirs) {
    const full = path.join(meta.dir, d);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
      const entries = fs.readdirSync(full, { withFileTypes: true });
      for (const e of entries) {
        const rel = path.join(d, e.name);
        lines.push(e.isDirectory() ? rel + "/" : rel);
      }
    } catch {
      /* skip */
    }
  }
  return lines.length ? lines.sort().join("\n") : "no optional directories (scripts/, references/, assets/)";
}

/** Build the <available_skills> XML block for the system prompt (per integrate-skills). */
export function buildAvailableSkillsXml(): string {
  const skills = discoverSkills();
  if (skills.length === 0) return "";
  const parts = skills.map(
    (s) =>
      `  <skill>\n    <name>${escapeXml(s.name)}</name>\n    <description>${escapeXml(s.description)}</description>\n    <location>${escapeXml(s.path)}</location>\n  </skill>`
  );
  return "<available_skills>\n" + parts.join("\n") + "\n</available_skills>";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
