#!/bin/bash
# Prepare log directory and meta.json if LOG_DIR is set
# LOG_DIR is a relative path under the workspace volume

if [ -n "$LOG_DIR" ]; then
    LOG_PATH="/home/coding-agent/workspace/${LOG_DIR}"
    mkdir -p "$LOG_PATH"
    export LOG_PATH
    export LOG_READY=true
else
    export LOG_READY=false
fi
