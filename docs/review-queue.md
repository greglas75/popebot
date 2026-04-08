# Review Queue

Commits pending review. Auto-managed:
- post-commit hook → adds new commits
- `/review` after audit → removes reviewed commits
- `/review mark-reviewed` → removes in bulk

- 81636c7 (2026-04-08) fix: security hardening — role default, LRU race, prompt injection, Docker limits, timeout, umask
- 4e380b0 (2026-04-08) feat: thepopebot with security hardening — role default, LRU race fix, prompt injection protection, Docker limits, timeout, umask
- 58b3927 (2026-04-08) feat: install zuvo plugin in Claude Code agent containers
- 4ee9ec8 (2026-04-08) feat: auto-update Claude Code + zuvo at every container start
- 55ec983 (2026-04-08) feat: add Codex CLI + Gemini CLI to coding-agent image, docs update
