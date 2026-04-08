#!/bin/bash
# Claude Code setup — trust config, onboarding skip, Playwright MCP

source /scripts/common/build-system-prompt.sh

# Auto-update Claude Code to latest version
echo "[setup] Updating Claude Code..."
npm i -g @anthropic-ai/claude-code@latest 2>/dev/null || echo "[setup] Claude Code update skipped (non-root)"

WORKSPACE_DIR=$(pwd)

mkdir -p ~/.claude

cat > ~/.claude/settings.json << 'EOF'
{
  "theme": "dark",
  "hasTrustDialogAccepted": true,
  "skipDangerousModePermissionPrompt": true,
  "permissions": {
    "allow": [
      "WebSearch",
      "WebFetch"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash /home/coding-agent/.claude-ttyd-sessions-hook.sh"
          }
        ]
      }
    ]
  }
}
EOF

# Write the session tracking hook script (run on every SessionStart)
# Writes Claude Code session_id to .claude-ttyd-sessions/${PORT:-7681} on first boot only
cat > /home/coding-agent/.claude-ttyd-sessions-hook.sh << 'EOF'
#!/bin/bash
SESSION_ID=$(cat | jq -r .session_id 2>/dev/null)
[ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ] && exit 0
DIR=/home/coding-agent/.claude-ttyd-sessions
mkdir -p "$DIR"
FILE="$DIR/${PORT:-7681}"
echo "$SESSION_ID" > "$FILE"
exit 0
EOF
chmod +x /home/coding-agent/.claude-ttyd-sessions-hook.sh

cat > ~/.claude.json << ENDJSON
{
  "hasCompletedOnboarding": true,
  "projects": {
    "${WORKSPACE_DIR}": {
      "allowedTools": ["WebSearch"],
      "hasTrustDialogAccepted": true,
      "hasTrustDialogHooksAccepted": true
    }
  }
}
ENDJSON

# Register Playwright MCP server for browser automation
claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@0.0.70 --headless --browser chromium --output-dir /home/coding-agent/workspace/.tmp

# Install zuvo plugin for quality gates, adversarial review, and skill ecosystem
if command -v claude &>/dev/null; then
  echo "[setup] Installing zuvo plugin..."
  # 1. Register marketplace + install plugin (creates cache dir)
  claude plugin marketplace add greglas75/zuvo-marketplace 2>/dev/null || true
  claude plugin marketplace update zuvo-marketplace 2>/dev/null || true
  claude plugin update zuvo@zuvo-marketplace 2>/dev/null || \
    claude plugin install zuvo 2>/dev/null || true
  # 2. Now run quick-install to sync files into cache + install to Codex/Cursor
  curl -fsSL https://raw.githubusercontent.com/greglas75/zuvo/main/scripts/quick-install.sh | bash 2>/dev/null || echo "[setup] zuvo install skipped (non-fatal)"
fi

# Activate agent-job-secrets skill when token is available (agent chat mode only)
if [ -n "$AGENT_JOB_TOKEN" ]; then
  ln -sfn ../library/agent-job-secrets skills/active/agent-job-secrets 2>/dev/null || true
fi
