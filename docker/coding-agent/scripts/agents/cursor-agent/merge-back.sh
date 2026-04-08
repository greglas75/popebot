#!/bin/bash
# Cursor Agent merge-back — fallback to claude for conflict resolution
claude --print "$(cat /home/coding-agent/.claude/commands/ai-merge-back.md)" || exit 1
