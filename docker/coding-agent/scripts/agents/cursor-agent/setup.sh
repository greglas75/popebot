#!/bin/bash
# Cursor Agent setup — system prompt, permissions

source /scripts/common/build-system-prompt.sh

WORKSPACE_DIR=$(pwd)

# Write system prompt to file for cursor-agent
if [ -n "$SYSTEM_PROMPT" ]; then
    echo "$SYSTEM_PROMPT" > "${WORKSPACE_DIR}/.cursor-agent-system-prompt.md"
fi

# Activate agent-job-secrets skill when token is available
if [ -n "$AGENT_JOB_TOKEN" ]; then
  ln -sfn ../library/agent-job-secrets skills/active/agent-job-secrets 2>/dev/null || true
fi
