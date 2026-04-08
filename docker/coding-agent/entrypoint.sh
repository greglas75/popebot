#!/bin/bash
set -e
umask 077

# ══════════════════════════════════════════════════════════════════════
# Unified Coding Agent Entrypoint
# ══════════════════════════════════════════════════════════════════════
#
# Two env vars select what runs:
#   RUNTIME  — the workflow (what steps to execute)
#   AGENT    — the coding agent (what tool does the work)
#
# ── REQUIRED ─────────────────────────────────────────────────────────
#
#   RUNTIME             agent-job | headless | interactive | cluster-worker | command/*
#                       Selects the script folder: /scripts/${RUNTIME}/
#
#   AGENT               claude-code | pi-coding-agent | opencode | codex-cli | gemini-cli | kimi-cli
#                       Selects the agent folder: /scripts/agents/${AGENT}/
#
# ── GIT / REPO ───────────────────────────────────────────────────────
#
#   GH_TOKEN            GitHub personal access token (used by all runtimes)
#   REPO                GitHub owner/repo slug (headless, interactive)
#   REPO_URL            Full git clone URL (job — includes token in URL)
#   BRANCH              Base branch to clone/checkout (default: main)
#   FEATURE_BRANCH      Feature branch to create or checkout (headless, interactive)
#
# ── AGENT ────────────────────────────────────────────────────────────
#
#   PROMPT              Task prompt passed to the agent via -p flag
#                       (headless, cluster-worker; job builds its own from config)
#   SYSTEM_PROMPT       Optional. Inline system prompt text. Nullable.
#                       Claude Code: --append-system-prompt
#                       Pi: written to .pi/SYSTEM.md (auto-loaded)
#   PERMISSION          plan | code (default: code)
#                       Controls agent permission mode (Claude Code only;
#                       Pi has no built-in permission system — TODO: address later)
#   CONTINUE_SESSION    1 = continue most recent session in the workspace
#                       Adds -c flag to agent CLI. Requires persistent volume.
#                       Saves ~40% tokens on multi-step workflows.
#   LLM_MODEL           Model override — passed to agent CLI via -m flag
#
# ── AUTH ─────────────────────────────────────────────────────────────
#   Pass whichever key(s) your agent/provider needs:
#
#   CLAUDE_CODE_OAUTH_TOKEN   OAuth token (Claude Code agent only)
#   ANTHROPIC_API_KEY         Anthropic API key
#   OPENAI_API_KEY            OpenAI API key
#   GOOGLE_API_KEY            Google API key
#   CUSTOM_API_KEY            Custom provider API key (if endpoint needs auth)
#   CUSTOM_OPENAI_BASE_URL           Custom OpenAI-compatible endpoint URL
#
# ── AGENT-JOB RUNTIME ────────────────────────────────────────────────
#
#   AGENT_JOB_TITLE     PR title and commit message
#   AGENT_JOB_DESCRIPTION  PR body and prompt content
#   AGENT_JOB_ID        Log directory name (fallback: extracted from branch)
#
# ── INTERACTIVE RUNTIME ──────────────────────────────────────────────
#
#   PORT                ttyd port (default: 7681)
#
# ── CLUSTER-WORKER RUNTIME ───────────────────────────────────────────
#
#   LOG_DIR             Directory for session logs (stdout/stderr + meta.json)
#
# ══════════════════════════════════════════════════════════════════════

if [ -z "$RUNTIME" ]; then
    echo "ERROR: RUNTIME env var is required (agent-job, headless, interactive, cluster-worker, command/*)"
    exit 1
fi

if [ ! -d "/scripts/${RUNTIME}" ]; then
    echo "ERROR: Unknown runtime '${RUNTIME}' — no scripts found at /scripts/${RUNTIME}/"
    exit 1
fi

if [ -z "$AGENT" ]; then
    echo "ERROR: AGENT env var is required (claude-code, pi-coding-agent, opencode, codex-cli, gemini-cli, kimi-cli)"
    exit 1
fi

if [ ! -d "/scripts/agents/${AGENT}" ]; then
    echo "ERROR: Unknown agent '${AGENT}' — no scripts found at /scripts/agents/${AGENT}/"
    exit 1
fi

# Copy tmux config if missing (bind mount shadows the image's /home/coding-agent)
if [ ! -f ~/.tmux.conf ] && [ -f /scripts/.tmux.conf ]; then
    cp /scripts/.tmux.conf ~/.tmux.conf
fi

for script in /scripts/${RUNTIME}/*.sh; do
    # Transform "1_setup-git.sh" → "Setup Git"
    pretty=$(basename "$script" .sh | sed 's/^[0-9]*_//' | sed 's/[-_]/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
    echo "→ ${pretty}"

    if ! source "$script"; then
        echo "ERROR: Script failed: $script (exit $?)" >&2
        exit 1
    fi
done
