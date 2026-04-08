#!/bin/bash
# Build SYSTEM_PROMPT from agent-job/SOUL.md + agent-job/SYSTEM.md

WORKSPACE_DIR=$(pwd)
SYSTEM_PROMPT=""

if [ -f "${WORKSPACE_DIR}/agent-job/SOUL.md" ]; then
    SYSTEM_PROMPT=$(cat "${WORKSPACE_DIR}/agent-job/SOUL.md")
    SYSTEM_PROMPT="${SYSTEM_PROMPT}

"
fi

if [ -f "${WORKSPACE_DIR}/agent-job/SYSTEM.md" ]; then
    SYSTEM_PROMPT="${SYSTEM_PROMPT}$(cat "${WORKSPACE_DIR}/agent-job/SYSTEM.md")"
fi

# Resolve {{datetime}} template variable
SYSTEM_PROMPT=$(echo "$SYSTEM_PROMPT" | sed "s/{{datetime}}/$(date -u +"%Y-%m-%dT%H:%M:%SZ")/g")

export SYSTEM_PROMPT
