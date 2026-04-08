# lib/db/ — Database (SQLite + Drizzle ORM)

## Column Naming Convention

Drizzle schema uses camelCase JS property names mapped to snake_case SQL columns.
Example: `createdAt: integer('created_at')` — use `createdAt` in JS code, SQL column is `created_at`.

## Migration Workflow

Edit `lib/db/schema.js` → `npm run db:generate` → review generated SQL in `drizzle/` → commit both schema change and migration file. Migrations auto-apply on startup via `migrate()` in `initDatabase()`.

Key files: `schema.js` (source of truth), `drizzle/` (generated migrations), `drizzle.config.js` (Drizzle Kit config), `index.js` (`initDatabase()` calls `migrate()`).

## CRUD Patterns

- Import `getDb()` from `./index.js`
- Functions are synchronous (better-sqlite3 driver)
- Primary keys: `crypto.randomUUID()`
- Timestamps: `Date.now()` (epoch milliseconds)

## Tables

| Table | Purpose |
|-------|---------|
| `users` | Admin accounts (email, bcrypt password hash, role) |
| `chats` | Chat sessions (user_id, title, starred, chat_mode, code_workspace_id, timestamps) |
| `messages` | Chat messages (chat_id, role, content) |
| `code_workspaces` | Code workspace containers (user_id, container_name, repo, branch, feature_branch, title, last_interactive_commit, starred, has_changes) |
| `notifications` | Job completion notifications (notification text, payload, read status) |
| `subscriptions` | Channel subscriptions (platform, channel_id) |
| `clusters` | Worker clusters (user_id, name, system_prompt, folders, enabled, starred) |
| `cluster_roles` | Role definitions scoped to a cluster (cluster_id, role_name, role, trigger_config, max_concurrency, cleanup_worker_dir, folders) |
| `settings` | Key-value configuration store (also stores API keys and OAuth tokens via type/key/value) |

## OAuth Token Storage

`lib/db/oauth-tokens.js` manages encrypted OAuth tokens for coding agent backends. Tokens are stored in the `settings` table with `type: 'config_secret'`.

**Token types** (`TOKEN_KEYS` map):
- `claudeCode` → `CLAUDE_CODE_OAUTH_TOKEN`
- `codex` → `CODEX_OAUTH_TOKEN`

**Key functions**: `createOAuthToken(tokenType, name, rawToken, userId)`, `listOAuthTokens(tokenType)`, `getNextOAuthToken(tokenType)` (LRU rotation — picks least-recently-used, updates `lastUsedAt`), `deleteOAuthTokenById(id)`, `getOAuthTokenCount(tokenType)`.

**Encryption**: `lib/db/crypto.js` provides AES-256-GCM encryption using `AUTH_SECRET` as the key derivation source (PBKDF2, 100k iterations). Token values are stored as JSON `{name, token}` where `token` is the encrypted ciphertext.

## Settings Table Types

The `settings` table stores all application config (not just key-value pairs). Four `type` values:

| Type | Storage | Purpose |
|------|---------|---------|
| `config` | Plaintext | LLM preferences, agent config, feature flags |
| `config_secret` | AES-256-GCM encrypted | API keys, tokens, GitHub secrets |
| `llm_provider` | Encrypted JSON | Custom OpenAI-compatible provider configs (baseUrl, apiKey, model) |
| `agent_job_secret` | Encrypted | Custom env vars injected into agent containers |

Key functions in `lib/db/config.js`: `getConfigValue()`, `setConfigValue()`, `getConfigSecret()`, `setConfigSecret()`, `getCustomProvider()`, `getAllAgentJobSecrets()`.

OAuth tokens for coding agent backends are stored as `config_secret` with LRU rotation via `lib/db/oauth-tokens.js`.

## Notable Columns

- `chats.chatMode` — `'agent'` (default) or `'code'`. Determines which agent singleton and tools are used.
- `codeWorkspaces.featureBranch` — tracks the git feature branch for the workspace session.
- `codeWorkspaces.hasChanges` — flag set when workspace has uncommitted changes.
