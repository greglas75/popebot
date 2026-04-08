#!/bin/bash
# Start Codex CLI in tmux, serve via ttyd (interactive runtime only)

CODEX_ARGS="codex"
if [ -n "$LLM_MODEL" ]; then
    CODEX_ARGS="$CODEX_ARGS --model $LLM_MODEL"
fi

SESSION_FILE="/home/coding-agent/.codex-ttyd-sessions/${PORT:-7681}"
if [ "$CONTINUE_SESSION" = "1" ] && [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ] && find /home/coding-agent/.codex/sessions -name "*${SESSION_ID}*" 2>/dev/null | grep -q .; then
        CODEX_ARGS="$CODEX_ARGS resume $SESSION_ID"
    fi
fi

tmux -u new-session -d -s codex -e PORT="${PORT:-7681}" $CODEX_ARGS
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t codex
