#!/bin/bash
set -e

# ── Load env vars from my-popebot ──
ENV_FILE="/Users/stephengpope/my-popebot/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found"
    exit 1
fi

source "$ENV_FILE"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Build base image ──
echo "Building base image..."
docker build --platform linux/amd64 -t coding-agent-base "$SCRIPT_DIR"

# ── Build claude-code image ──
echo ""
echo "Building claude-code image..."
docker build --platform linux/amd64 -t coding-agent-claude-code -f "$SCRIPT_DIR/Dockerfile.claude-code" "$SCRIPT_DIR"

# ── Run headless test (plan mode, no feature branch = read-only, no push) ──
echo ""
echo "Running: RUNTIME=headless | AGENT=claude-code | PERMISSION=plan"
echo ""

docker run --rm --platform linux/amd64 \
    -e RUNTIME=headless \
    -e REPO="${GH_OWNER}/${GH_REPO}" \
    -e BRANCH=main \
    -e PERMISSION=plan \
    -e PROMPT="List the top-level files and describe this project in 2 sentences." \
    -e GH_TOKEN="${GH_TOKEN}" \
    -e CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN}" \
    coding-agent-claude-code
