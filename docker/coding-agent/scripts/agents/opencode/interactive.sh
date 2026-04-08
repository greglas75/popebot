#!/bin/bash
# Start OpenCode in tmux, serve via ttyd (interactive runtime only)

OPENCODE_ARGS="opencode"
if [ -n "$LLM_MODEL" ]; then
    OPENCODE_ARGS="$OPENCODE_ARGS --model $LLM_MODEL"
fi

SESSION_FILE="/home/coding-agent/.opencode-ttyd-sessions/${PORT:-7681}"
if [ "$CONTINUE_SESSION" = "1" ] && [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ] && opencode session list --format json 2>/dev/null | grep -qF "$SESSION_ID"; then
        OPENCODE_ARGS="$OPENCODE_ARGS --session $SESSION_ID"
    fi
fi

tmux -u new-session -d -s opencode -e PORT="${PORT:-7681}" $OPENCODE_ARGS
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t opencode
