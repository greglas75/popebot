# Roadmap

## Completed

- [x] Security hardening (10 fixes) — see FORK_SECURITY.md
- [x] VPS deployment (Contabo Singapore, 96GB)
- [x] SSL via Traefik + Let's Encrypt
- [x] Auto-update Claude Code at container start
- [x] Auto-install zuvo plugin at container start
- [x] One-command deploy (`./deploy.sh`)
- [x] Multi-token OAuth rotation (Claude Max)

## Short-term (next)

### GitHub Issues → Agent Jobs
- Label issue with `popebot` → triggers agent job
- On completion, bot comments on issue with PR link
- Complexity: S (8-12h)
- Files: `api/index.js`, new `lib/tools/issue-to-job.js`, new `lib/db/github-links.js`

### Persistent knowledge per repo
- SQLite table stores repo-specific facts
- Injected into system prompt for future jobs
- Adapts zuvo's knowledge-prime/knowledge-curate pattern
- Complexity: M (15-25h)

### Adversarial review gate
- Port zuvo's `adversarial-review.sh` as post-job hook
- Claude writes → Gemini/Codex reviews → auto-merge only if approved
- Complexity: S-M (10-15h, leveraging existing zuvo code)

## Medium-term

### Per-job cost budget
- `budget_usd` field in job config
- Kill job if exceeded
- Dashboard showing cost per job/user

### Context condensation
- Mid-job summarization for long-running tasks
- Prevents context window blowout

### Multi-model auto-routing
- Route tasks to optimal backend based on complexity
- Complex architecture → Opus, routine tests → Sonnet, search → Gemini

### Admin UI: plugin management
- Detect new zuvo/codesift versions
- One-click install/update from admin panel

## Long-term

### Session reconnect/resume
- If container crashes, resume from last checkpoint
- Checkpoint file on agent-job branch

### Agent observability dashboard
- Per-job timeline of tool calls
- Token usage breakdown
- Success/failure rates by backend
- P50/P95 job duration

### Microagent knowledge base
- `.popebot/microagents/` directory in repos
- Keyword-matched, injected into system prompt

## Competitive reference

Based on analysis of: OpenHands, Devin 2.0, Coder, AWS Kiro, metaswarm, GitHub Copilot Workspace, SWE-agent. See competitive analysis notes in project memory.
