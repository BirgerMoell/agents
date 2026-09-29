# README Hero Infographic Prompt

Use this prompt to generate a polished README hero infographic for the top of the original
TypeScript repository.

Suggested output path after generation:

```text
docs/assets/agents-from-scratch-infographic.png
```

Suggested Markdown placement directly below the main README heading:

```markdown
![Agents from Scratch architecture infographic](docs/assets/agents-from-scratch-infographic.png)
```

## Copy-Paste Prompt

```text
Create a world-class 16:9 README hero infographic for a GitHub repository titled "Agents from Scratch".

Purpose:
Explain that this is a compact TypeScript project for learning how to build an AI agent from scratch: an OpenAI Responses API loop, strict function tools, local workspace tools, and Agent Skills. The image should help new users understand the repo in under ten seconds.

Art direction:
Premium technical education infographic for a serious course project. Use a clean light background, deep ink text, TypeScript blue accents, mint green for tools, amber for skills, and coral for caution/safety. Make it feel like a polished engineering diagram from a top developer documentation site. Use crisp vector-like shapes, precise arrows, large labels, and generous spacing. Avoid official company logos, fake screenshots, decorative clutter, tiny labels, dark backgrounds, generic AI brain imagery, or random code snippets.

Canvas:
2400 x 1350 px, 16:9 aspect ratio, high resolution, readable at GitHub README width.

Main title:
"Agents from Scratch"

Subtitle:
"A minimal TypeScript agent loop with tools and Agent Skills"

Central architecture:
Show a clear loop with numbered nodes:
1. User message
2. agent.ts
3. OpenAI Responses API
4. function_call
5. tools.ts executes local tools
6. function_call_output
7. Final assistant answer

Make "agent.ts" and "tools.ts" the two strongest code-module nodes. The arrows should make it obvious that tool calls can repeat until the model has enough information to answer.

Left module stack:
Show a vertical stack labeled "Core files":
- agent.ts: chat loop
- tools.ts: tool schemas + runners
- skills.ts: skill discovery
- .skills/: reusable instructions
- README.md: setup + course notes

Right capability stack:
Show a vertical stack labeled "What the agent can do":
- read project files
- list directories
- search the codebase
- fetch URLs
- run Bash
- load Agent Skills

Bottom band:
Add a horizontal band labeled "Agent Skills pattern":
.skills/<skill>/SKILL.md -> metadata in system prompt -> load_skill -> read_skill_file

Small footer note:
"Built to expose the real model-tool loop, not hide it behind a framework."

Text rules:
Use only the labels above or very close variants. Keep text large, sparse, and legible. No paragraphs inside the image. Do not misspell "TypeScript", "Responses API", "function_call", "function_call_output", "agent.ts", "tools.ts", or "skills.ts".

Composition rules:
The central loop should be the visual anchor. The left stack explains the repository structure. The right stack explains the available capabilities. The bottom band explains Agent Skills. Use consistent line weights, aligned cards, clear arrows, and a restrained multi-accent palette. Leave enough top and bottom padding so the image looks elegant embedded directly below the README title.

Negative constraints:
No official logos. No mascots. No 3D robots. No busy dashboards. No fake terminal output. No invented metrics. No extra features that are not represented in the repository.
```
