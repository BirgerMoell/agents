---
name: create-skill
description: Create new Agent Skills. Use when the user wants to add a skill, make a new skill, write a SKILL.md, or extend the agent with a new capability. Covers the SKILL.md format, frontmatter rules, and optional scripts/references/assets.
---

# Creating New Agent Skills

Use this skill when the user wants to create, add, or write a new Agent Skill.

## Skill format (agentskills.io)

A skill is a **folder** under `.skills/` containing at minimum a **SKILL.md** file.

```
.skills/
└── my-new-skill/
    └── SKILL.md    # required
    ├── scripts/    # optional: runnable code
    ├── references/ # optional: extra docs
    └── assets/     # optional: templates, data
```

## SKILL.md structure

1. **YAML frontmatter** (required) between `---` lines:
   - **name**: Skill id, 1–64 chars, lowercase letters, numbers, hyphens only. Must **exactly match the folder name** (e.g. folder `my-new-skill` → `name: my-new-skill`). No leading/trailing hyphens, no `--`.
   - **description**: 1–1024 chars. Say what the skill does **and when to use it**. Include keywords so the agent can match user tasks.

2. **Markdown body**: Instructions for the agent. Steps, examples, edge cases. Keep under ~500 lines; put long reference material in `references/`.

## Example frontmatter

```yaml
---
name: my-new-skill
description: Short summary of what it does. Use when the user asks for X, Y, or Z.
---
```

## Steps to add a new skill

1. Create a folder under `.skills/` with the skill name (e.g. `.skills/my-new-skill/`).
2. Add `SKILL.md` with valid frontmatter (`name` matching the folder, `description`) and the instruction body.
3. Optionally add `scripts/`, `references/`, or `assets/` and reference them in the body (e.g. "See references/REFERENCE.md" or "Run scripts/setup.sh").
4. The agent discovers skills at startup; new skills appear after the next run (or the user can list with list_skills).

## Tools you can use

- **list_dir** with path `.skills` to see existing skill folders.
- **read_file** to show the user this skill’s SKILL.md as a template (e.g. `.skills/create-skill/SKILL.md`).
- **bash** to create directories and files (e.g. `mkdir -p .skills/foo`, then write SKILL.md via a heredoc or echo).
- **write_file** is not a tool here; use **bash** to create or overwrite files (e.g. `cat > .skills/foo/SKILL.md << 'EOF'` ... `EOF`).

When the user describes what they want the skill to do, draft the folder name, the frontmatter, and the instruction body, then create the files.
