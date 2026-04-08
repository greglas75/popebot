# Fork Deployment (TGM)

## Server

| Detail | Value |
|--------|-------|
| Provider | Contabo, Asia (Singapore) |
| IP | 217.217.252.206 |
| Domain | coding.tgmedit.com |
| SSH | `ssh vps` (key-based, password disabled) |
| Specs | 16 vCPU, 96GB RAM, 350GB NVMe |
| OS | Ubuntu 24.04 |

## Architecture

```
coding.tgmedit.com (HTTPS)
    │
    ▼
Traefik (Let's Encrypt SSL)
    │
    ▼
Event Handler (greglas75/popebot:event-handler-latest)
    │
    ├── Chat (Mistral API)
    ├── Agent Jobs (Claude Code + OAuth token)
    └── Code Workspaces (Claude Code interactive terminal)
         │
         └── Coding Agent Container (stephengpope/thepopebot:coding-agent-claude-code-1.2.75)
              ├── Auto-update Claude Code on start
              └── Auto-install zuvo plugin on start
```

## Docker images

| Image | Purpose | Source |
|-------|---------|--------|
| `greglas75/popebot:event-handler-latest` | Web UI, API, job orchestration | `docker/event-handler/Dockerfile` |
| `greglas75/popebot:coding-agent-base` | Base image (Ubuntu, Node, Git, Playwright) | `docker/coding-agent/Dockerfile` |
| `greglas75/popebot:coding-agent-claude-code` | Claude Code agent (tagged as official) | `docker/coding-agent/Dockerfile.claude-code` |

The claude-code image is tagged as `stephengpope/thepopebot:coding-agent-claude-code-1.2.75` so the event handler picks it up automatically.

## Deploy workflow

### One command from Mac

```bash
cd ~/DEV/thepopebot
./deploy.sh "description of changes"
```

This does:
1. `git add -A` + commit + push to GitHub
2. SSH to VPS → `git pull`
3. Rebuild all Docker images
4. Restart services

### Manual rebuild on VPS

```bash
ssh vps
/root/rebuild.sh
```

### What rebuild.sh does

1. Pulls latest code from `greglas75/popebot`
2. Builds base coding-agent image
3. Builds claude-code image (with auto-update + zuvo)
4. Tags it as official image name
5. Builds event-handler image
6. Restarts docker compose

## SSL

SSL is handled via `docker-compose.custom.yml` which extends the base compose with:
- Traefik Let's Encrypt TLS challenge
- HTTP → HTTPS redirect
- Certificate stored in `traefik-config/acme.json`

Start command:
```bash
cd ~/bot && docker compose -f docker-compose.yml -f docker-compose.custom.yml up -d
```

## Firewall

```
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw allow 3000
```

SSH login: key-based only (password disabled).

## Database

SQLite at `~/bot/data/db/thepopebot.sqlite`. Backed up by Contabo Auto Backup ($5.83/mo).

## Troubleshooting

### Agent job not starting
```bash
docker logs thepopebot-event-handler 2>&1 | tail -30
```

### Code workspace shows [exited]
Click `+ Code` tab to open new workspace. Old containers are not reusable.

### Anthropic 529 (overloaded)
Wait 15-30 min. Claude Code auto-retries up to 10 times with exponential backoff.

### Chat returns 400
Check model name in DB:
```bash
sqlite3 ~/bot/data/db/thepopebot.sqlite "SELECT key, value FROM settings WHERE key = 'LLM_MODEL';"
```
