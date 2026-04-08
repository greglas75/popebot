#!/bin/bash
# Run OpenCode headlessly with the given PROMPT
# Sets AGENT_EXIT for downstream scripts (commit, push, etc.)

OPENCODE_ARGS=(run --format json)

if [ -n "$LLM_MODEL" ]; then
    OPENCODE_ARGS+=(--model "$LLM_MODEL")
fi

SESSION_FILE="/home/coding-agent/.opencode-ttyd-sessions/7681"
if [ "$CONTINUE_SESSION" = "1" ] && [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ] && opencode session list --format json 2>/dev/null | grep -qF "$SESSION_ID"; then
        OPENCODE_ARGS+=(--session "$SESSION_ID")
    fi
fi

# Prompt is positional (must come last)
OPENCODE_ARGS+=("$PROMPT")

set +e
opencode "${OPENCODE_ARGS[@]}"
AGENT_EXIT=$?
set -e
