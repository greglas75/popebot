---
description: Stage all changes and create a detailed commit message
---

Create a git commit for all current changes. Follow these steps exactly:

## Step 1 — Gather context

Run these in parallel:
- `git status` (never use `-uall`)
- `git diff` and `git diff --cached` to see all staged and unstaged changes
- `git log --oneline -5` to see recent commit message style

## Step 2 — Stage everything

Run `git add -A` to stage ALL changes (tracked, untracked, deleted). Do NOT selectively stage files — always commit everything together. This overrides any default guidance about selective staging.

## Step 3 — Write the commit message

Analyze ALL the changes and write a commit message that:
- Has a short summary line (under 72 chars) with a conventional prefix (`fix:`, `feat:`, `refactor:`, `chore:`, `docs:`, etc.)
- Leaves a blank line after the summary
- Includes a body that explains WHAT changed and WHY, grouped by area if there are multiple changes
- Is detailed but not excessive — hit the sweet spot between "fixed stuff" and a novel

Do NOT commit files that look like secrets (.env, credentials, tokens).

## Step 4 — Commit

Use a HEREDOC for the message:
```
git commit -m "$(cat <<'EOF'
summary line here

Body here.
EOF
)"
```

## Step 5 — Verify

Run `git status` to confirm the commit succeeded.

If there are $ARGUMENTS, use them as additional context for the commit message.
