# setup/ — Interactive Setup Wizard

Entry point: `setup.mjs` (invoked via `thepopebot setup`).

## Wizard Steps

1. **Prerequisites** — Checks Node.js (>=18), git, gh CLI (authenticated), Docker. Initializes git repo and GitHub remote if needed.
2. **GitHub PAT** — Validates fine-grained token with required scopes (Actions, Admin, Contents, PRs, Secrets, Workflows).
3. **App URL** — Prompts for public HTTPS URL (ngrok, VPS, PaaS). Generates webhook secret.
4. **Sync Config** — Writes secrets/variables to GitHub and local DB via `syncConfig()`.
5. **Build** — Runs `npm run build` with retry.
6. **Start Server** — Starts Docker containers, polls `/api/ping` to confirm.

## Sync Target Types

Config values are synced to different targets via `lib/sync.mjs`:

| Target | Storage | Example |
|--------|---------|---------|
| `env` | `.env` file | `APP_URL`, `GH_OWNER` |
| `db` | `settings` table (plaintext) | Non-secret config |
| `db_secret` | `settings` table (encrypted) | `GH_TOKEN` |
| `github_secret` | GitHub repo secret | `GH_TOKEN`, `WEBHOOK_SECRET` |
| `github_variable` | GitHub repo variable | `LLM_PROVIDER`, `LLM_MODEL` |

A single config field can sync to multiple targets (e.g., `GH_TOKEN` → `db_secret` + `github_secret` + `env`).

## Adding New Config Fields

1. Add the field definition to the sync config map in `lib/sync.mjs` with its target(s)
2. If it needs user input, add a prompt step in `setup.mjs`
3. Run `syncConfig()` to write to all targets
