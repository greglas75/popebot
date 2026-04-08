#!/bin/bash
# Set up job metadata, log directory, write system prompt audit log, and build task prompt

cd /home/coding-agent/workspace

# Extract job ID from branch if not set
if [ -z "$AGENT_JOB_ID" ] && [[ "$BRANCH" == agent-job/* ]]; then
    export AGENT_JOB_ID="${BRANCH#agent-job/}"
fi

# Setup logs directory
LOG_DIR="/home/coding-agent/workspace/logs/${AGENT_JOB_ID}"
mkdir -p "$LOG_DIR"
export LOG_DIR

# Write system prompt to log for audit (built by setup.sh via build-system-prompt.sh)
SYSTEM_PROMPT_FILE="${LOG_DIR}/system-prompt.md"
echo "$SYSTEM_PROMPT" > "$SYSTEM_PROMPT_FILE"
export SYSTEM_PROMPT_FILE

# Read job metadata — prefer env vars (set by event handler), fall back to config file
if [ -z "$AGENT_JOB_TITLE" ] || [ -z "$AGENT_JOB_DESCRIPTION" ]; then
    CONFIG_FILE="logs/${AGENT_JOB_ID}/agent-job.config.json"
    if [ -f "$CONFIG_FILE" ]; then
        [ -z "$AGENT_JOB_TITLE" ] && export AGENT_JOB_TITLE=$(jq -r '.title // empty' "$CONFIG_FILE")
        [ -z "$AGENT_JOB_DESCRIPTION" ] && export AGENT_JOB_DESCRIPTION=$(jq -r '.job // empty' "$CONFIG_FILE")
    fi
fi

# Build the prompt from description
export PROMPT="

# Your Job

${AGENT_JOB_DESCRIPTION}"
