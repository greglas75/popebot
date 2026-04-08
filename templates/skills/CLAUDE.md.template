# skills/ — Agent Skills

Skills are lightweight plugins that extend agent abilities. Each skill lives in `skills/library/<skill-name>/` and is activated by symlinking into `skills/active/`.

## How Skills Work

1. **Discovery** — The system scans `skills/active/` for directories containing `SKILL.md`.
2. **Frontmatter loaded** — The `description` from YAML frontmatter is included in the system prompt under "Active skills" (via the `{{skills}}` template variable).
3. **Full SKILL.md read on demand** — When the agent decides to use a skill, it reads the full `SKILL.md` for detailed usage instructions.

Both Pi and Claude Code discover skills from the same `skills/active/` directory (via `.pi/skills` and `.claude/skills` symlink bridges).

## Conventions

### Language Preference

**Bash first.** Skills are glue code — API calls, data piping, file manipulation. Bash + curl + python3 (for JSON) handles nearly everything. No module systems, no dependency management, no surprises.

Use Node.js **only** when a required library has no alternative (e.g., `youtube-transcript-plus`). Never for new skills where bash + curl would work.

### Bash Script Standards

- Include `#!/bin/bash` and `set -euo pipefail` at the top
- `chmod +x` after creating

### Node.js Module Rules

The root `package.json` has `"type": "module"`, which forces **all** `.js` files in the project tree to be treated as ESM. This silently breaks any script using `require()`.

- **`.cjs`** — for CommonJS scripts (uses `require()`)
- **`.mjs`** — for ESM scripts (uses `import`)
- **Never use plain `.js`** for skill scripts. The behavior depends on the nearest `package.json` and will break unpredictably.

If you encounter a broken `.js` script in a skill, rename it to `.cjs` or `.mjs` as appropriate and update SKILL.md references.

### SKILL.md Format

Every skill must have a `SKILL.md` with YAML frontmatter:

```markdown
---
name: skill-name-in-kebab-case
description: One sentence describing what the skill does and when to use it.
---

# Skill Name

## Usage

```bash
skills/library/skill-name/script.sh <args>
```
```

- The `description` field appears in the system prompt — keep it concise and action-oriented.
- Use project-root-relative paths in documentation (e.g., `skills/library/skill-name/script.sh`).

### Skill Structure

- **`SKILL.md`** (required) — YAML frontmatter + markdown documentation
- **Scripts** — bash (`.sh`) by default, `.cjs`/`.mjs` only when necessary
- **`package.json`** (optional) — only if Node.js dependencies are truly needed

### Credential Setup

If a skill needs an API key, add it via the admin UI (Settings > Agent Jobs > Secrets). The secret will be injected as an env var into Docker containers. The agent can discover available secrets via the `get-secret` skill.

### Activation & Deactivation

```bash
# Activate
ln -s ../library/skill-name skills/active/skill-name

# Deactivate
rm skills/active/skill-name
```

The `skills/active/` directory is shared by both agent backends via symlink bridges:
- `.claude/skills → skills/active`
- `.pi/skills → skills/active`

## Creating a Skill

### Simple bash skill (most common)

```bash
mkdir skills/library/my-skill
```

**skills/library/my-skill/SKILL.md:**
```markdown
---
name: my-skill
description: Does X when the agent needs to Y.
---

# My Skill

## Setup
Requires MY_API_KEY environment variable.

## Usage
```bash
skills/library/my-skill/run.sh <args>
```
```

**skills/library/my-skill/run.sh:**
```bash
#!/bin/bash
set -euo pipefail

if [ -z "$1" ]; then echo "Usage: run.sh <args>"; exit 1; fi
if [ -z "$MY_API_KEY" ]; then echo "Error: MY_API_KEY not set"; exit 1; fi
# ... skill logic
```

Then make it executable and activate:
```bash
chmod +x skills/library/my-skill/run.sh
ln -s ../library/my-skill skills/active/my-skill
```

### Node.js skill

Use only when a required library has no bash/curl alternative. Add a `package.json` with dependencies — they're installed automatically in Docker. Use `.cjs` for CommonJS or `.mjs` for ESM — never plain `.js`.

## Testing

Always build AND test a skill in the same job. Tell the agent to test with real input after creating the skill and fix any issues before committing.

## Default Skills

Check `skills/library/` for available built-in skills. Activate any you need by symlinking into `skills/active/`.
