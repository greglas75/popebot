#!/bin/bash
# Claude Code merge-back — AI-driven conflict resolution when rebase fails

claude -p "$(cat /home/coding-agent/.claude/commands/ai-merge-back.md)" \
    --dangerously-skip-permissions || exit 1
