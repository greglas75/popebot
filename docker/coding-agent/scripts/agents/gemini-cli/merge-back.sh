#!/bin/bash
# Gemini CLI merge-back — AI-driven conflict resolution when rebase fails

gemini -p "$(cat /home/coding-agent/.claude/commands/ai-merge-back.md)" \
    --approval-mode yolo || exit 1
