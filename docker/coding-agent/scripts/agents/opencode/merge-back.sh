#!/bin/bash
# OpenCode merge-back — AI-driven conflict resolution when rebase fails

opencode run "$(cat /home/coding-agent/.claude/commands/ai-merge-back.md)" || exit 1
