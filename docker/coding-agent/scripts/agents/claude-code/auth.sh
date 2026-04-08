#!/bin/bash
# Auth priority: ANTHROPIC_AUTH_TOKEN (third-party backend) > CLAUDE_CODE_OAUTH_TOKEN > ANTHROPIC_API_KEY
if [ -n "$ANTHROPIC_AUTH_TOKEN" ]; then
    # Third-party backend — clear conflicting auth
    unset ANTHROPIC_API_KEY
    unset CLAUDE_CODE_OAUTH_TOKEN
elif [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    # OAuth token — clear API key so Claude Code picks OAuth
    unset ANTHROPIC_API_KEY
fi
# Otherwise ANTHROPIC_API_KEY stays in env and Claude Code uses it directly
