#!/bin/bash
# Run Codex CLI headlessly with the given PROMPT
# Sets AGENT_EXIT for downstream scripts (commit, push, etc.)

CODEX_ARGS=(exec)

SESSION_FILE="/home/coding-agent/.codex-ttyd-sessions/7681"
if [ "$CONTINUE_SESSION" = "1" ] && [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    if [ -n "$SESSION_ID" ] && find /home/coding-agent/.codex/sessions -name "*${SESSION_ID}*" 2>/dev/null | grep -q .; then
        CODEX_ARGS+=(resume "$SESSION_ID")
    fi
fi

CODEX_ARGS+=("$PROMPT" --json --dangerously-bypass-approvals-and-sandbox)

if [ -n "$LLM_MODEL" ]; then
    CODEX_ARGS+=(--model "$LLM_MODEL")
fi

set +e
codex "${CODEX_ARGS[@]}"
AGENT_EXIT=$?
set -e
