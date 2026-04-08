#!/bin/bash
# Run the agent — capture exit code, log output to LOG_DIR

cd /home/coding-agent/workspace

# Append built file content to existing SYSTEM_PROMPT (with newline separator)
if [ -f "$SYSTEM_PROMPT_FILE" ]; then
    FILE_CONTENT=$(cat "$SYSTEM_PROMPT_FILE")
    if [ -n "$SYSTEM_PROMPT" ]; then
        export SYSTEM_PROMPT="${SYSTEM_PROMPT}
${FILE_CONTENT}"
    else
        export SYSTEM_PROMPT="${FILE_CONTENT}"
    fi
fi

# Default to full permissions for job runtime (respect pre-set value if any)
export PERMISSION=${PERMISSION:-code}

set +e
source /scripts/agents/${AGENT}/run.sh > "${LOG_DIR}/claude-session.jsonl" 2>"${LOG_DIR}/claude-stderr.log"
# AGENT_EXIT is set by the agent's run.sh
set -e
