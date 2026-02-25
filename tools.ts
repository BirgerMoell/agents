import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { FunctionTool } from "openai/resources/responses/responses";
import * as skills from "./skills.js";

const WORKSPACE = process.cwd();

function resolveSafe(filePath: string): string {
  const resolved = path.resolve(WORKSPACE, path.normalize(filePath));
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error("path must be inside workspace");
  }
  return resolved;
}

/** OpenAI Responses API tool definitions (for the `tools` parameter). */
export const toolDefinitions: FunctionTool[] = [
  {
    type: "function",
    name: "ping",
    description: "Ping a host on the internet. Use to check reachability or latency.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: "Hostname or IP address to ping (e.g. 8.8.8.8 or google.com)",
        },
      },
      required: ["host"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "bash",
    description: "Run a bash command on the system. Use for shell scripting or to execute arbitrary shell commands. Dangerous! Use with care.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "read_file",
    description: "Read the full contents of a file in the workspace. Use to inspect source code, configs, or any text file. Path is relative to the project root.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to project root (e.g. README.md or src/index.ts)",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_dir",
    description: "List contents of a directory (files and subdirectories). Use to explore project structure. Path is relative to project root; use '.' for root.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path relative to project root (e.g. . or src)",
        },
        recursive: {
          type: "boolean",
          description: "If true, list recursively with depth 2 (one level of subdirs). Default false.",
        },
      },
      required: ["path", "recursive"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "fetch_url",
    description: "Fetch content from a URL (GET). Use to read docs, APIs, or any public web page. Returns response body as text.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full URL to fetch (e.g. https://example.com/docs)",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search_files",
    description: "Search for a string or regex in file contents under the workspace. Use to find where something is defined or used. Optionally limit by directory or file glob.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "String or regex pattern to search for (e.g. runTool or function.*bash)",
        },
        dir: {
          type: "string",
          description: "Directory to search in, relative to project root. Default: . (whole project)",
        },
        glob: {
          type: "string",
          description: "Optional file glob to limit matches (e.g. *.ts or **/*.md). Default: all files",
        },
      },
      required: ["pattern", "dir", "glob"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "load_skill",
    description: "Load an Agent Skill by name. Use when a task matches an available skill's description. Returns the full SKILL.md content (instructions). Call this to activate a skill before following its instructions.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name (e.g. pdf-processing). Must match a skill listed in available_skills.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "read_skill_file",
    description: "Read a file inside a skill's scripts/, references/, or assets/ directory. Use after loading a skill when the skill instructions reference a bundled file.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        skill_name: {
          type: "string",
          description: "Skill name (e.g. pdf-processing)",
        },
        path: {
          type: "string",
          description: "Path relative to skill root (e.g. references/REFERENCE.md or scripts/extract.py)",
        },
      },
      required: ["skill_name", "path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_skills",
    description: "List available Agent Skills (name and description). Use to see what skills are installed when the user asks.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

export type ToolName = (typeof toolDefinitions)[number]["name"];

/** Run a tool by name with the given JSON arguments. Returns string output for the API. */
export function runTool(
  name: ToolName,
  args: Record<string, unknown>
): string {
  switch (name) {
    case "ping": {
      const host = args.host;
      if (typeof host !== "string" || !host.trim()) {
        return "error: host must be a non-empty string";
      }
      return ping(host.trim());
    }
    case "bash": {
      const command = args.command;
      if (typeof command !== "string" || !command.trim()) {
        return "error: command must be a non-empty string";
      }
      return bash(command.trim());
    }
    case "read_file": {
      const filePath = args.path;
      if (typeof filePath !== "string" || !filePath.trim()) {
        return "error: path must be a non-empty string";
      }
      return readFile(filePath.trim());
    }
    case "list_dir": {
      const dirPath = args.path;
      const recursive = args.recursive === true;
      if (typeof dirPath !== "string") {
        return "error: path must be a string";
      }
      return listDir(dirPath.trim() || ".", recursive);
    }
    case "fetch_url": {
      const url = args.url;
      if (typeof url !== "string" || !url.trim()) {
        return "error: url must be a non-empty string";
      }
      return fetchUrl(url.trim());
    }
    case "search_files": {
      const pattern = args.pattern;
      const dir = typeof args.dir === "string" ? args.dir.trim() || "." : ".";
      const glob = typeof args.glob === "string" ? args.glob.trim() : undefined;
      if (typeof pattern !== "string" || !pattern.trim()) {
        return "error: pattern must be a non-empty string";
      }
      return searchFiles(pattern.trim(), dir, glob);
    }
    case "load_skill": {
      const skillName = args.name;
      if (typeof skillName !== "string" || !skillName.trim()) {
        return "error: name must be a non-empty string";
      }
      const content = skills.getSkillContent(skillName.trim());
      return content ?? `error: skill "${skillName.trim()}" not found`;
    }
    case "read_skill_file": {
      const skillName = args.skill_name;
      const relPath = args.path;
      if (typeof skillName !== "string" || !skillName.trim()) {
        return "error: skill_name must be a non-empty string";
      }
      if (typeof relPath !== "string" || !relPath.trim()) {
        return "error: path must be a non-empty string";
      }
      return skills.readSkillFile(skillName.trim(), relPath.trim());
    }
    case "list_skills": {
      const list = skills.discoverSkills();
      if (list.length === 0) return "No skills installed. Add skill folders with SKILL.md to the .skills directory.";
      return list.map((s) => `${s.name}: ${s.description}`).join("\n\n");
    }
    default:
      return `error: unknown tool "${name}"`;
  }
}

function ping(host: string): string {
  try {
    const result = execSync(`ping -c 5 ${host}`, {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 100 * 1024,
    });
    return result;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const out = err.stdout ?? err.stderr ?? err.message ?? String(e);
    return `error: ${out}`;
  }
}

function bash(command: string): string {
  try {
    const result = execSync(command, {
      encoding: "utf8",
      shell: "/bin/bash",
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
    return result;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const out = err.stdout ?? err.stderr ?? err.message ?? String(e);
    return `error: ${out}`;
  }
}

function readFile(filePath: string): string {
  try {
    const resolved = resolveSafe(filePath);
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return "error: not a file";
    const content = fs.readFileSync(resolved, "utf8");
    return content;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return "error: file not found";
    if (err.message?.includes("workspace")) return "error: path must be inside workspace";
    return `error: ${err.message ?? String(e)}`;
  }
}

function listDir(dirPath: string, recursive: boolean): string {
  try {
    const resolved = resolveSafe(dirPath);
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return "error: not a directory";
    const base = path.relative(WORKSPACE, resolved) || ".";

    function list(dir: string, prefix: string, depth: number): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const lines: string[] = [];
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = path.join(prefix, e.name);
        if (e.isDirectory()) {
          lines.push(rel + "/");
          if (recursive && depth < 2) {
            lines.push(...list(path.join(dir, e.name), rel, depth + 1));
          }
        } else {
          lines.push(rel);
        }
      }
      return lines;
    }
    return list(resolved, base, 0).join("\n") || "(empty)";
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return "error: directory not found";
    if (err.message?.includes("workspace")) return "error: path must be inside workspace";
    return `error: ${err.message ?? String(e)}`;
  }
}

function fetchUrl(url: string): string {
  try {
    const safe = url.replace(/"/g, '\\"');
    const result = execSync(
      `curl -sL --max-time 15 --user-agent "PolymathAgent/1.0" "${safe}"`,
      { encoding: "utf8", maxBuffer: 1024 * 1024, shell: "/bin/bash" }
    );
    return result.slice(0, 300_000);
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string; status?: number };
    const out = err.stderr ?? err.stdout ?? err.message ?? String(e);
    return `error: ${out}`;
  }
}

function searchFiles(pattern: string, dir: string, glob?: string): string {
  try {
    const resolvedDir = resolveSafe(dir);
    const isDir = fs.statSync(resolvedDir).isDirectory();
    if (!isDir) return "error: not a directory";
    const regex = (() => {
      try {
        return new RegExp(pattern, "g");
      } catch {
        return new RegExp(escapeRe(pattern), "g");
      }
    })();
    const extFromGlob = glob?.match(/\*\.(\w+)$/)?.[1];
    const results: string[] = [];
    const maxResults = 200;
    const maxBytes = 500_000;

    function walk(dir: string): void {
      if (results.length >= maxResults) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(WORKSPACE, full);
        if (!rel || rel.startsWith("..")) continue;
        if (e.isDirectory()) {
          if (!e.name.startsWith(".") && e.name !== "node_modules") walk(full);
          continue;
        }
        if (extFromGlob && path.extname(e.name).slice(1) !== extFromGlob) continue;
        try {
          const content = fs.readFileSync(full, "utf8");
          if (content.length > maxBytes) continue;
          let match: RegExpExecArray | null;
          regex.lastIndex = 0;
          while ((match = regex.exec(content)) !== null && results.length < maxResults) {
            const line = content.slice(0, match.index).split("\n").length;
            results.push(`${rel}:${line}: ${match[0]}`);
          }
        } catch {
          /* skip binary / unreadable */
        }
      }
    }
    walk(resolvedDir);
    return results.length ? results.join("\n") : "no matches";
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return "error: directory not found";
    if (err.message?.includes("workspace")) return "error: path must be inside workspace";
    return `error: ${err.message ?? String(e)}`;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
