#!/bin/bash
# Gemini CLI auth — API key or OAuth credentials
if [ -n "$GEMINI_OAUTH_CREDS" ]; then
    # OAuth mode — write credentials to ~/.gemini/oauth_creds.json
    mkdir -p ~/.gemini
    echo "$GEMINI_OAUTH_CREDS" > ~/.gemini/oauth_creds.json
    chmod 600 ~/.gemini/oauth_creds.json
    echo "[auth] Gemini OAuth credentials written"
elif [ -n "$GOOGLE_API_KEY" ]; then
    export GEMINI_API_KEY="$GOOGLE_API_KEY"
fi
