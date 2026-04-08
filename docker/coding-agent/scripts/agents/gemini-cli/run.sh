#!/bin/bash
# Run Gemini CLI headlessly with the given PROMPT
# Sets AGENT_EXIT for downstream scripts (commit, push, etc.)

APPROVAL_MODE="yolo"
if [ "$PERMISSION" = "plan" ]; then
    APPROVAL_MODE="plan"
fi

GEMINI_ARGS=(-p "$PROMPT" --output-format stream-json --approval-mode "$APPROVAL_MODE")

if [ -n "$LLM_MODEL" ]; then
    GEMINI_ARGS+=(--model "$LLM_MODEL")
fi

SESSION_FILE="/home/coding-agent/.gemini-ttyd-sessions/7681"
if [ "$CONTINUE_SESSION" = "1" ] && [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ] && gemini --list-sessions 2>/dev/null | grep -qF "$SESSION_ID"; then
        GEMINI_ARGS+=(--resume "$SESSION_ID")
    fi
fi

set +e
gemini "${GEMINI_ARGS[@]}"
AGENT_EXIT=$?
set -e
