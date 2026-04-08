# PopeBot (TGM Fork)

Technical reference for AI assistants modifying this fork of thepopebot.

## Deploy

```bash
# From Mac — one command does everything:
./deploy.sh "description of changes"
```

This does: commit → push → SSH to VPS → rebuild all images → restart.

### Manual deploy (step by step)

```bash
# 1. Commit and push (from Mac):
cd ~/DEV/thepopebot
git add -A && git commit -m "description"
git push origin clean-main

# 2. Rebuild on VPS (from Mac via SSH):
ssh -i ~/.ssh/id_ed25519 root@217.217.252.206 /root/rebuild.sh
```

Or SSH into VPS directly:
```bash
ssh vps                    # alias — may not work from Claude Code shell
ssh -i ~/.ssh/id_ed25519 root@217.217.252.206   # direct — always works
/root/rebuild.sh
```

### Git setup

Single remote: `origin` → `github.com/greglas75/popebot` (our fork). No upstream remote configured — upstream code (stephengpope/thepopebot) is consumed via npm, not git.

**Working branch**: `clean-main`. Push:
```bash
git push origin clean-main
```

**Do NOT** add stephengpope/thepopebot as a git remote — the histories are unrelated (1030 upstream commits vs our fork) and cannot be merged.

### Performance audit status

Full 12-dimension performance audit completed (2026-04-08). Report: `audits/performance-audit-2026-04-08.md`. Spec: `docs/specs/2026-04-08-perf-phase3-spec.md`.

All findings fixed and verified through 3 rounds of adversarial review (internal + 6 cross-provider models). Upstream bugs reported: stephengpope/thepopebot#240.

Findings discovered using [zuvo:performance-audit](https://zuvo.dev/en/skills/performance-audit/) and [zuvo:review](https://zuvo.dev/en/skills/review/) with [CodeSift](https://codesift.app/) for codebase analysis.

### Reporting bugs to upstream

When you find bugs or security issues in the upstream thepopebot package, report them on GitHub:

```bash
gh issue create --repo stephengpope/thepopebot \
  --title "Brief description of the issue" \
  --body "Description with file paths, line numbers, and fix suggestions.

> Findings discovered using [zuvo:<skill-name>](https://zuvo.dev/en/skills/<skill-name>/) with [CodeSift](https://codesift.app/) for codebase analysis."
```

Use the actual zuvo skill that found the issue in the link, e.g.:
- `zuvo:performance-audit` → `https://zuvo.dev/en/skills/performance-audit/`
- `zuvo:review` → `https://zuvo.dev/en/skills/review/`
- `zuvo:security-audit` → `https://zuvo.dev/en/skills/security-audit/`
- `zuvo:pentest` → `https://zuvo.dev/en/skills/pentest/`
- `zuvo:db-audit` → `https://zuvo.dev/en/skills/db-audit/`
- etc. Pattern: `https://zuvo.dev/en/skills/<skill-name>/`

Existing report: stephengpope/thepopebot#240 (15 performance + security findings).

## Fork docs

- [FORK_DEPLOYMENT.md](docs/FORK_DEPLOYMENT.md) — architecture, images, SSL, troubleshooting
- [FORK_SECURITY.md](docs/FORK_SECURITY.md) — 10 security fixes with details
- [ZUVO_INTEGRATION.md](docs/ZUVO_INTEGRATION.md) — auto-install, 48 skills, adversarial review
- [TEAM_SETUP.md](docs/TEAM_SETUP.md) — users, OAuth tokens, cost management
- [ROADMAP.md](docs/ROADMAP.md) — what's done, what's next

---

## Upstream Reference

**Architecture**: Event Handler (Next.js) creates `agent-job/*` branches → launches Docker agent container locally (Claude Code, Pi, etc.) → task executed → PR created → auto-merge → notification. Agent jobs log to `logs/{JOB_ID}/`.

## Deployment Model

The npm package (`api/`, `lib/`, `config/`, `bin/`) is published to npm by upstream. In production:

- **Event handler**: Docker image installs `thepopebot` from npm, then **overlays the fork's `lib/`** on top (see Fork Build below). Next.js app source (`web/`) and `.next` build output are baked in. User project directories (`agent-job/`, `event-handler/`, `skills/`, `.env`, `data/`, etc.) are individually volume-mounted into `/app`. The full project is also mounted at `/project` for git access. Runs `server.js` via PM2 behind Traefik reverse proxy.
- **`lib/paths.js`**: Exports `PROJECT_ROOT` (`process.cwd()`). This is how the installed npm package finds the volume-mounted user project files.
- **Agent-job containers**: Ephemeral Docker containers clone `agent-job/*` branches separately — use named volumes for workspace. See `docker/CLAUDE.md`.
- **Local install**: Gives users CLI tools (`init`, `setup`, `upgrade`) and configuration scaffolding.

## Fork Build — How lib/ Changes Get Into Docker

The upstream `thepopebot` npm package contains `lib/`. Our fork modifies `lib/` but does NOT publish to npm. The event-handler Dockerfile handles this:

1. `npm install thepopebot@{version}` — installs upstream package + its deps
2. `npm install {fork deps}` — installs extra deps from fork's `package.json` (e.g. `p-limit`)  
3. `COPY lib/ ./node_modules/thepopebot/lib/` — overlays fork's `lib/` on top of npm package

**This means**: any change to `lib/` requires a Docker rebuild (`/root/rebuild.sh`) to take effect. The overlay happens in `docker/event-handler/Dockerfile`.

**Critical — JSX must be compiled before deploy:**
Next.js loads `.js` files, NOT `.jsx`. After editing any `.jsx` file in `lib/chat/components/`, `lib/auth/components/`, `lib/code/`, or `lib/cluster/components/`, you MUST run:
```bash
npm run build    # compiles .jsx → .js via esbuild
```
Then commit both the `.jsx` AND `.js` files (use `git add -f` — `.js` files are gitignored).
Without this step, your UI changes will NOT appear even after a Docker rebuild.

**Important**: all deps must be installed in ONE `npm install` call. Two sequential calls cause npm to prune transitive deps (like `next`). If you add a new dependency to `package.json`, the single-install approach handles it automatically.

## Package vs. Templates — Where Code Goes

All event handler logic, API routes, library code, and core functionality lives in the **npm package** (`api/`, `lib/`, `config/`, `bin/`). This is what users import when they `import ... from 'thepopebot/...'`.

The `templates/` directory contains **only files that get scaffolded into user projects** via `npx thepopebot init`. Templates are for user-editable configuration and thin wiring — things users are expected to customize or override. Never add core logic to templates.

**When adding or modifying event handler code, always put it in the package itself (e.g., `api/`, `lib/`), not in `templates/`.** Templates should only contain:
- Configuration files users edit (`agent-job/SOUL.md`, `agent-job/CRONS.json`, `event-handler/TRIGGERS.json`, etc.)
- GitHub Actions workflows
- Docker compose (`docker-compose.yml`)
- CLAUDE.md files for AI assistant context in user projects

Next.js app source files (`app/`, `next.config.mjs`, `server.js`, etc.) live in `web/` at the package root. These are built into the Docker image — NOT scaffolded to user projects.

### Managed Paths

Files in managed directories are auto-synced (created, updated, **and deleted**) by `init` to match the package templates exactly. Users should not edit these files — changes will be overwritten on upgrade. Managed paths are defined in `bin/managed-paths.js`:

- `.github/workflows/` — CI/CD workflows
- `docker-compose.yml`, `.dockerignore` — Docker config
- `.gitignore` — Git ignore rules
- `CLAUDE.md` — AI assistant context

## Directory Structure

```
/
├── api/                        # GET/POST handlers for all /api/* routes
├── lib/
│   ├── actions.js              # Shared action executor (agent, command, webhook)
│   ├── cron.js                 # Cron scheduler (loads CRONS.json)
│   ├── triggers.js             # Webhook trigger middleware (loads TRIGGERS.json)
│   ├── paths.js                # Exports PROJECT_ROOT (process.cwd())
│   ├── ai/                     # LLM integration (agent, model, tools, streaming)
│   ├── auth/                   # NextAuth config, helpers, middleware, server actions, components
│   ├── channels/               # Channel adapters (base class, Telegram, factory)
│   ├── chat/                   # Chat route handler, server actions, React UI components
│   ├── cluster/                # Worker clusters (roles, triggers, Docker containers)
│   ├── code/                   # Code workspaces (server actions, terminal view, WebSocket proxy)
│   ├── containers/             # Container SSE streaming (Docker container status)
│   ├── db/                     # SQLite via Drizzle (schema, migrations, api-keys)
│   ├── tools/                  # Job creation, GitHub API, Telegram, Docker, Whisper
│   ├── voice/                  # Voice input (AssemblyAI streaming transcription)
│   └── utils/
│       └── render-md.js        # Markdown {{include}} processor
├── config/
│   ├── index.js                # withThepopebot() Next.js config wrapper
│   └── instrumentation.js      # Server startup hook (loads .env, starts crons)
├── bin/                        # CLI entry point (init, setup, reset, diff, upgrade)
├── setup/                      # Interactive setup wizard
├── web/                        # Next.js app source (baked into Docker image, NOT scaffolded)
│   ├── app/                    # Next.js app directory (pages, layouts, routes)
│   ├── server.js               # Custom Next.js server with WebSocket proxy
│   ├── next.config.mjs         # Next.js config wrapper
│   ├── instrumentation.js      # Server startup hook
│   ├── middleware.js            # Auth middleware
│   └── postcss.config.mjs      # PostCSS/Tailwind config
├── templates/                  # Scaffolded to user projects (see rule above)
├── docs/                       # Extended documentation
└── package.json
```

## NPM Package Exports

Exports defined in `package.json` `exports` field. Pattern: `thepopebot/{module}` maps to source files in `api/`, `lib/`, `config/`. Includes `./cluster/*`, `./voice/*` exports. Add new exports there when creating new importable modules.

## UI Component Standards

Settings/admin pages use shared components from `lib/chat/components/settings-shared.jsx`. See `lib/chat/components/CLAUDE.md` for the full UI standards (button tiers, dialogs, save feedback, delete confirmation, spacing, etc.). **Follow these standards when adding new settings pages.**

## Build System

Run `npm run build` before publish. esbuild compiles `lib/chat/components/**/*.jsx`, `lib/auth/components/**/*.jsx`, `lib/code/*.jsx`, `lib/cluster/components/**/*.jsx` to ES modules.

## Database

SQLite via Drizzle ORM at `data/thepopebot.sqlite` (override with `DATABASE_PATH`). Auto-initialized on server start. See `lib/db/CLAUDE.md` for schema details, CRUD patterns, and column naming.

### Migration Rules

**All schema changes MUST go through the migration workflow.**

- **NEVER** write raw `CREATE TABLE`, `ALTER TABLE`, or any DDL SQL manually
- **NEVER** modify `initDatabase()` to add schema changes
- **ALWAYS** make schema changes by editing `lib/db/schema.js` then running `npm run db:generate`

## Security: Route Architecture

**`/api` routes are for external callers only.** They authenticate via `x-api-key` header or webhook secrets (Telegram, GitHub). Never add session/cookie auth to `/api` routes.

**Browser UI uses fetch route handlers colocated with pages.** All authenticated browser-to-server calls use Next.js route handlers (`route.js` files in `web/app/`) that check `auth()` session. Do NOT use server actions for data fetching — they cause page refresh issues. Handler implementations live in `lib/chat/api.js`; route files are thin re-exports.

**`/stream/*` is for actual SSE streaming only.** Three endpoints use Server-Sent Events: `/stream/chat` (AI SDK streaming), `/stream/containers` (Docker container status), `/stream/cluster/[clusterId]/logs` (cluster logs). All other fetch routes are colocated with their page directories.

| Caller | Mechanism | Auth | Location |
|--------|-----------|------|----------|
| External (cURL, GitHub Actions, Telegram) | `/api` route handler | `x-api-key` or webhook secret | `api/index.js` |
| Browser UI (data/mutations) | Fetch route handler colocated with page | `auth()` session check | `web/app/<page>/route.js` |
| Browser UI (SSE streaming) | EventSource / AI SDK streaming | `auth()` session check | `web/app/stream/` |

## Action Dispatch System

Shared executor for cron jobs and webhook triggers (`lib/actions.js`). Three action types: `agent` (Docker LLM container), `command` (shell command), `webhook` (HTTP request). See `lib/CLAUDE.md` for detailed dispatch format, cron/trigger config, and template tokens.

## LLM Providers

See `lib/ai/CLAUDE.md` for the provider table and model defaults. Key: `LLM_PROVIDER` + `LLM_MODEL` env vars, `LLM_MAX_TOKENS` defaults to 4096.

## Workspaces

- **Code Workspaces**: Interactive Docker containers with in-browser terminal. See `lib/code/CLAUDE.md`.
- **Cluster Workspaces**: Groups of Docker containers spawned from role definitions with triggers. See `lib/cluster/CLAUDE.md`.

Both use `lib/tools/docker.js` for container lifecycle via Unix socket API.

## Skills System

Skills live in `skills/library/`. Activate by symlinking into `skills/active/`. Each skill has `SKILL.md` with YAML frontmatter (`name`, `description`). The `{{skills}}` template variable in markdown files resolves active skill descriptions at runtime. Default active skill: `get-secret`. Pi agent auto-activates `browser-tools` (other agents use Playwright MCP).

## Template Config & Markdown Includes

Config markdown files support `{{ filepath.md }}` includes (resolved relative to project root) and built-in variables (`{{datetime}}`, `{{skills}}`), powered by `lib/utils/render-md.js`.

## Config Variable Architecture

`LLM_MODEL` and `LLM_PROVIDER` exist in two separate systems using the same names:

- **`.env`** — read by the event handler (chat). Set by `setup/lib/sync.mjs`.
- **GitHub repository variables** — read by agent job containers. Set by `setup/lib/sync.mjs`.

These are independent environments. They use the same variable names. They can hold different values (e.g. chat uses sonnet, jobs use opus). Do NOT create separate `AGENT_LLM_*` variable names — just set different values in `.env` vs GitHub variables.
