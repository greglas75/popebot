#!/bin/bash
# Cursor Agent auth — API key via env var
if [ -n "$CURSOR_API_KEY" ]; then
    echo "[auth] Cursor API key set"
fi
