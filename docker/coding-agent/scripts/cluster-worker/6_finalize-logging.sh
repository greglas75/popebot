#!/bin/bash
# Write endedAt to meta.json (best-effort)

if [ "$LOG_READY" = "true" ] && [ -f "$LOG_PATH/meta.json" ]; then
    jq --arg end "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '. + {endedAt: $end}' \
        "$LOG_PATH/meta.json" > "$LOG_PATH/meta.tmp" 2>/dev/null \
        && mv "$LOG_PATH/meta.tmp" "$LOG_PATH/meta.json"
fi

# Re-raise agent exit code
if [ "${AGENT_EXIT:-0}" -ne 0 ]; then
    exit $AGENT_EXIT
fi
