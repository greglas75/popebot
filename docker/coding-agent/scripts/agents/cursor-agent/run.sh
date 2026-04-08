#!/bin/bash
# Run Cursor Agent headlessly with the given PROMPT

CURSOR_ARGS=(-p --mode ask --trust --workspace .)

if [ -n "$LLM_MODEL" ]; then
    CURSOR_ARGS+=(-m "$LLM_MODEL")
fi

echo "[run] PERMISSION=${PERMISSION:-<unset>}"

set +e
timeout 3600 cursor-agent "${CURSOR_ARGS[@]}" <<< "$PROMPT"
AGENT_EXIT=$?
set -e
