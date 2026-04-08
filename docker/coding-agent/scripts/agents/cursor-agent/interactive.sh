#!/bin/bash
# Start Cursor Agent in tmux, serve via ttyd (interactive runtime only)

CURSOR_ARGS="cursor-agent"
if [ -n "$LLM_MODEL" ]; then
    CURSOR_ARGS="$CURSOR_ARGS -m $LLM_MODEL"
fi

tmux -u new-session -d -s cursor -e PORT="${PORT:-7681}" $CURSOR_ARGS
exec ttyd --writable -p "${PORT:-7681}" tmux attach -t cursor
