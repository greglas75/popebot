#!/bin/bash
# Codex CLI auth — credentials cached in ~/.codex/auth.json
# Codex does NOT read OPENAI_API_KEY from env, must use `codex login`
if [ -n "$CODEX_OAUTH_TOKEN" ]; then
    echo "$CODEX_OAUTH_TOKEN" | codex login --with-api-key
elif [ -n "$OPENAI_API_KEY" ]; then
    echo "$OPENAI_API_KEY" | codex login --with-api-key
fi
