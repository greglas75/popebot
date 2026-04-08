#!/bin/bash
# Pi merge-back — run Pi to resolve rebase conflicts
# Pi doesn't have slash commands like Claude Code, so we pass the instructions directly

pi -p "$(cat /home/coding-agent/.claude/commands/ai-merge-back.md)" || exit 1
