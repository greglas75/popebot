#!/bin/bash
# Codex CLI merge-back — AI-driven conflict resolution when rebase fails

codex exec "$(cat /home/coding-agent/.claude/commands/ai-merge-back.md)" --full-auto || exit 1
