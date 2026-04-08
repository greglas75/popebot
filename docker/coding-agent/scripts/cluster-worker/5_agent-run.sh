#!/bin/bash
# Run the agent with optional tee to log files

cd /home/coding-agent/workspace

# Map PLAN_MODE=1 to PERMISSION=plan for backwards compatibility
if [ "$PLAN_MODE" = "1" ]; then
    export PERMISSION=plan
fi

if [ "$LOG_READY" = "true" ]; then
    set +e
    source /scripts/agents/${AGENT}/run.sh \
        > >(tee "$LOG_PATH/stdout.jsonl") \
        2> >(tee "$LOG_PATH/stderr.txt" >&2)
    # AGENT_EXIT is set by the agent's run.sh
    set -e
else
    source /scripts/agents/${AGENT}/run.sh
fi
