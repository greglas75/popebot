# Zuvo Integration

## What is zuvo

[Zuvo](https://github.com/greglas75/zuvo-marketplace) is a Claude Code plugin with 48 skills for code quality, testing, adversarial review, and development workflows.

## How it works in thepopebot

Zuvo is installed automatically at every container start via `setup.sh`:

```bash
# docker/coding-agent/scripts/agents/claude-code/setup.sh
curl -fsSL https://raw.githubusercontent.com/greglas75/zuvo/main/scripts/quick-install.sh | bash -
```

This means:
- Every new agent job gets the latest zuvo
- Every new Code Workspace gets the latest zuvo
- No manual updates needed

## Available skills

After zuvo installs, agents can use all 48 skills including:

| Category | Skills |
|----------|--------|
| Core | `/zuvo:build`, `/zuvo:review`, `/zuvo:refactor`, `/zuvo:debug` |
| Pipeline | `/zuvo:brainstorm`, `/zuvo:plan`, `/zuvo:execute` |
| Quality | `/zuvo:code-audit`, `/zuvo:test-audit`, `/zuvo:security-audit` |
| Testing | `/zuvo:write-tests`, `/zuvo:write-e2e`, `/zuvo:fix-tests` |
| Release | `/zuvo:ship`, `/zuvo:deploy`, `/zuvo:canary` |

## Adversarial review

Zuvo's adversarial review system is built into 14+ skills. When an agent uses `/zuvo:build` or `/zuvo:review`, it automatically:

1. Runs the primary task
2. Dispatches to cross-model reviewers (Codex, Gemini, Claude opposite model)
3. Enforces evidence-based findings (no `file:line` = auto-downgrade)
4. Logs per-provider outcomes with model names and timing

## Knowledge system

Zuvo includes cross-session knowledge:
- `knowledge-prime.md` — injects project patterns before work
- `knowledge-curate.md` — extracts learnings after each session
- `session-state.md` — resume protocol with validation

## Limitations

- Zuvo uses relative paths (`../../shared/includes/`) which resolve within the plugin cache directory
- Plugin installation adds ~10-15 seconds to container startup
- If `quick-install.sh` fails (network issue), zuvo is skipped (non-fatal)
- Interactive Code Workspaces created before our image change need manual install: `! curl -fsSL https://raw.githubusercontent.com/greglas75/zuvo/main/scripts/quick-install.sh | bash`
