#!/bin/bash
# Start Gemini CLI in tmux, serve via ttyd (interactive runtime only)

GEMINI_ARGS="gemini --approval-mode yolo"
if [ -n "$LLM_MODEL" ]; then
    GEMINI_ARGS="$GEMINI_ARGS --model $LLM_MODEL"
fi

SESSION_FILE="/home/coding-agent/.gemini-ttyd-sessions/${PORT:-7681}"
if [ "$CONTINUE_SESSION" = "1" ] && [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ] && gemini --list-sessions 2>/dev/null | grep -qF "$SESSION_ID"; then
        GEMINI_ARGS="$GEMINI_ARGS --resume $SESSION_ID"
    fi
fi

tmux -u new-session -d -s gemini -e PORT="${PORT:-7681}" $GEMINI_ARGS
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t gemini
