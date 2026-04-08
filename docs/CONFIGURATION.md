# Configuration

## Overview

Configuration is database-backed. Most settings are stored in SQLite (encrypted for secrets, plaintext for config values). The admin UI is the primary way to manage settings.

`.env` is only for infrastructure variables that must exist before the database is available.

**Config resolution order**: cache -> OAuth tokens (LRU) -> custom provider API key -> DB secret -> DB plain config -> env vars (infrastructure only) -> defaults

---

## Admin UI Reference

| Path | What it configures |
|------|--------------------|
| `/admin/event-handler/llms` | LLM provider API keys + custom providers |
| `/admin/event-handler/chat` | Active chat LLM provider, model, max tokens |
| `/admin/event-handler/coding-agents` | Coding agent backends (5 agents), auth, models |
| `/admin/event-handler/agent-jobs` | Custom env vars for agent containers |
| `/admin/event-handler/webhooks` | API keys for `/api` endpoint auth |
| `/admin/event-handler/telegram` | Bot token, webhook secret, chat ID |
| `/admin/event-handler/voice` | AssemblyAI API key |
| `/admin/github/tokens` | GitHub PAT, webhook secret |
| `/admin/github/secrets` | GitHub repository secrets |
| `/admin/github/variables` | GitHub repository variables |
| `/admin/users` | User accounts |
| `/admin/general` | Auto-upgrade, beta channel, email updates |

---

## Infrastructure Variables (.env)

These must be set in `.env` because they are needed before the database is available:

| Variable | Description |
|----------|-------------|
| `GH_OWNER` | GitHub repository owner |
| `GH_REPO` | GitHub repository name |
| `APP_URL` | Public HTTPS URL for webhooks |
| `APP_HOSTNAME` | Hostname extracted from APP_URL |
| `AUTH_SECRET` | Required. Encryption key for sessions and DB secrets |
| `AUTH_TRUST_HOST` | Set to `true` for production |
| `DATABASE_PATH` | SQLite path (default: `data/db/thepopebot.sqlite`) |
| `LETSENCRYPT_EMAIL` | Email for Let's Encrypt HTTPS certificates |
| `THEPOPEBOT_VERSION` | Package version (set automatically) |

---

## DB-Backed Secrets

Stored encrypted (AES-256-GCM) in SQLite, managed via the admin UI:

`GH_TOKEN`, `GH_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ASSEMBLYAI_API_KEY`

---

## DB-Backed Config

Stored as plaintext in SQLite, managed via the admin UI:

`LLM_PROVIDER` (default: `anthropic`), `LLM_MODEL` (auto from provider), `LLM_MAX_TOKENS` (default: `4096`), `AGENT_BACKEND`, `CUSTOM_OPENAI_BASE_URL`, `TELEGRAM_CHAT_ID`, `UPGRADE_INCLUDE_BETA` (default: `false`), `CODING_AGENT` (default: `claude-code`), plus `CODING_AGENT_*` keys for the 5 agent backends.

---

## GitHub Personal Access Token

Create a fine-grained PAT scoped to your repository only. Required permissions:

| Permission | Access | Why |
|------------|--------|-----|
| Actions | Read and write | Trigger and monitor workflows |
| Administration | Read and write | Required for self-hosted runners |
| Contents | Read and write | Create branches, commit files |
| Metadata | Read-only | Required (auto-selected) |
| Pull requests | Read and write | Create and manage PRs |
| Secrets | Read and write | Manage agent secrets from the web UI |
| Workflows | Read and write | Create and update workflow files |

Manage your PAT at Admin > GitHub > Tokens.

---

## Agent Job Secrets

Managed at Admin > Event Handler > Agent Jobs. Stored encrypted in SQLite, injected as env vars into Docker containers at runtime. Supports manual text entry or OAuth flow. The agent can discover available secrets via the `get-secret` skill.

---

## GitHub Repository Variables

Set via `npx thepopebot set-var` or at Admin > GitHub > Variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_URL` | Public URL for the event handler | -- |
| `AUTO_MERGE` | Set to `false` to disable auto-merge of job PRs | Enabled |
| `ALLOWED_PATHS` | Comma-separated path prefixes for auto-merge | `/logs` |
| `AGENT_JOB_IMAGE_URL` | Docker image for agent job container | `stephengpope/thepopebot:coding-agent-claude-code-${THEPOPEBOT_VERSION}` |
| `EVENT_HANDLER_IMAGE_URL` | Docker image for event handler | `stephengpope/thepopebot:event-handler-${THEPOPEBOT_VERSION}` |
| `RUNS_ON` | GitHub Actions runner label (e.g., `self-hosted`) | `ubuntu-latest` |
| `LLM_PROVIDER` | LLM provider for agent jobs | `anthropic` |
| `LLM_MODEL` | LLM model for agent jobs | Provider default |
| `CUSTOM_OPENAI_BASE_URL` | Custom OpenAI-compatible base URL | -- |
| `AGENT_BACKEND` | Agent runner (e.g., `claude-code`, `pi`) | `claude-code` |

---

## Custom LLM Providers

Add OpenAI-compatible providers via Admin > Event Handler > LLMs. Each custom provider has: name, base URL, API key (optional), and model list. Stored encrypted in the database.

---

## Docker Compose

For self-hosted deployment:

```bash
docker compose up -d
```

This starts three services:

- **Traefik** -- Reverse proxy with automatic SSL (Let's Encrypt if `LETSENCRYPT_EMAIL` is set)
- **Event Handler** -- Next.js + PM2, serves the app on port 80
- **Runner** -- Self-hosted GitHub Actions runner for executing jobs

Set `RUNS_ON=self-hosted` as a GitHub repository variable to route workflows to your runner.

See the [Architecture docs](ARCHITECTURE.md) for more details.

---

## Changing APP_URL

If your public URL changes:

1. Update `APP_URL` and `APP_HOSTNAME` in `.env`
2. Update the GitHub repository variable: `npx thepopebot set-var APP_URL <url>`
3. Restart Docker: `docker compose up -d`
4. If Telegram is configured, re-register the webhook: `npm run setup-telegram`
