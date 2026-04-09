# Implementation Plan: Architecture Fixes (A2, A3, A4, A5, A7)

**Spec:** `docs/specs/2026-04-08-arch-fixes-spec.md`
**spec_id:** arch-fixes-2026-04-08
**plan_revision:** 1
**status:** Reviewed
**Created:** 2026-04-08
**Tasks:** 10
**Estimated complexity:** 3 standard + 4 complex + 3 standard (migration/wiring)

## Architecture Summary

5 findings from the architecture review scored at 15/27 (56%). This plan addresses A2 (layering), A3 (circular dep), A4 (SRP), A5 (scalability/security), A7 (observability). A6 (tests) is handled separately by the user.

**Affected modules:** `lib/rate-limit.js`, `lib/config.js`, `lib/ai/agent.js`, `lib/chat/api.js`, `lib/chat/actions.js`, `lib/db/chats.js`, `lib/db/schema.js`, `config/instrumentation.js`, `api/index.js`. New: `lib/logger.js`, `lib/chat/actions/` (8 domain files + barrel).

**Dependency direction:** Foundation tasks (schema, logger) first, then core fixes (rate-limiter, circular dep, query extraction), then large refactor (actions split), then staged logger migration.

## Technical Decisions

- **A5 Rate limiter:** SQLite `rate_limit_entries` table (key + timestamp, indexed). Sync API preserved (better-sqlite3). Lazy cleanup on read. Fail-open on DB error. No transaction needed — better-sqlite3 is synchronous and Node.js is single-threaded, so each rateLimit() call blocks the event loop atomically. No concurrent interleaving is possible.
- **A7 Logger:** `createLogger(module)` factory. JSON in prod, pretty in dev. `LOG_LEVEL` env var. Staged migration: logger module first, then 3 priority files.
- **A2 Query extraction:** 3 new DAL functions in `lib/db/chats.js`. Ownership check stays in callers. `telegram` user ID handled by callers, not DAL.
- **A3 Circular dep:** `onConfigInvalidate(cb)` callback registration on `globalThis`. Agent.js registers itself at import time. Zero callbacks handled gracefully.
- **A4 Actions split:** 8 domain files + barrel re-export `lib/chat/actions/index.js`. `'use server'` in each file. `requireAuth`/`requireAdmin` duplicated per-file (they're 5-line helpers; sharing adds import complexity). `syncLitellmConfig` private in `settings.js`.

## Quality Strategy

**CQ gates activated:**
- CQ5 (PII): Logger must not log rate-limit keys containing emails. Sanitize or redact.
- CQ8 (Error handling): Rate limiter DB calls wrapped in try/catch, fail-open.
- CQ21 (Concurrency): Rate limiter is safe — better-sqlite3 sync calls block the event loop, preventing interleaving. No transaction needed.
- CQ22 (Cleanup): `setInterval` timer removed from rate-limit.js.
- CQ23 (Cache): Config cache invalidation callback on `globalThis` survives chunk duplication.
- CQ26 (Observability): Directly addressed by A7.

**Top risks:**
1. A5 concurrent write correctness — transaction-based approach mitigates
2. A7 PII leakage — audit each migrated call site
3. A4 `'use server'` directive missing from any domain file — verify per-file
4. A3 callback registration timing — graceful null handling

**Tests:** User handles separately. Verification steps use manual checks and `npx madge` for structural verification.

---

## Task Breakdown

### Task 1: Add `rateLimitEntries` table to schema and generate migration
**Files:** `lib/db/schema.js`
**Complexity:** standard
**Dependencies:** none
**Execution routing:** default

- [ ] RED: Verify no `rateLimitEntries` export exists in `lib/db/schema.js`
- [ ] GREEN: Add table definition to `lib/db/schema.js`:
  ```js
  export const rateLimitEntries = sqliteTable('rate_limit_entries', {
    key: text('key').notNull(),
    timestamp: integer('timestamp').notNull(),
  }, (table) => [
    index('rate_limit_entries_key_idx').on(table.key),
  ]);
  ```
  No explicit PK — SQLite rowid suffices. The index on `key` enables efficient per-key lookups and range deletes. Duplicate (key, timestamp) rows are harmless (same request can't fire twice in the same millisecond in a single-threaded Node.js process).
- [ ] Verify: `npm run db:generate`
  Expected: New migration file generated in `drizzle/` with `CREATE TABLE rate_limit_entries`
- [ ] Acceptance: AC1.1 (schema exists for persistence)
- [ ] Commit: `add rate_limit_entries schema for rate limiter persistence`

### Task 2: Create structured logger module
**Files:** `lib/logger.js` (new)
**Complexity:** standard
**Dependencies:** none
**Execution routing:** default

- [ ] RED: Verify `lib/logger.js` does not exist
- [ ] GREEN: Create `lib/logger.js` with:
  - `createLogger(module)` factory returning `{ info, warn, error, debug }`
  - Each method: `(message, meta = {}) => void`
  - JSON output when `NODE_ENV === 'production'`: `{"level":"info","module":"chat/api","msg":"...","ts":<epoch>,...meta}`
  - Pretty output otherwise: `[INFO] [chat/api] message {meta}`
  - `LOG_LEVEL` env var controls threshold (default: `info`). Levels: `debug < info < warn < error`
  - No external dependencies — use `process.stdout.write` + `JSON.stringify`
  - CQ5: Do NOT log full error stacks at `info` level; `error` level only
- [ ] Verify: `node -e "import('./lib/logger.js').then(m => { const log = m.createLogger('test'); log.info('hello', {x:1}); log.debug('hidden'); })"`
  Expected: One info line printed, debug suppressed (default LOG_LEVEL=info)
- [ ] Acceptance: AC2.1, AC2.2, AC2.3, AC2.4 (request ID via meta parameter), AC2.6, AC2.7
- [ ] Commit: `add structured logger module with level filtering and JSON output`

### Task 3: Rewrite rate limiter to use SQLite persistence
**Files:** `lib/rate-limit.js`, `lib/db/index.js`
**Complexity:** complex
**Dependencies:** Task 1
**Execution routing:** deep

- [ ] RED: Current `lib/rate-limit.js` uses in-memory `Map` and `setInterval` cleanup timer. After this task, Map and timer are gone, replaced by SQLite.
- [ ] GREEN: 
  **In `lib/db/index.js`:** Add `export function getSqliteDb() { getDb(); return _db.$client; }` — exposes the raw better-sqlite3 instance for hot-path queries without depending on Drizzle internals.
  
  **Rewrite `lib/rate-limit.js`:**
  - Import `getSqliteDb` from `./db/index.js`
  - `rateLimit(key, maxRequests, windowMs)` stays synchronous, same signature
  - Implementation (no transaction needed — better-sqlite3 is synchronous, Node.js single-threaded, calls block the event loop so no concurrent interleaving is possible):
    1. `DELETE FROM rate_limit_entries WHERE key = ? AND timestamp < ?` (lazy cleanup, threshold = `Date.now() - windowMs`)
    2. `SELECT COUNT(*) as count FROM rate_limit_entries WHERE key = ? AND timestamp >= ?`
    3. If count >= maxRequests: return `{ allowed: false, retryAfter }`
    4. Else: `INSERT INTO rate_limit_entries (key, timestamp) VALUES (?, Date.now())`, return `{ allowed: true }`
  - Use prepared statements via `getSqliteDb().prepare(sql)` for performance
  - Wrap entire DB block in try/catch — on any error, return `{ allowed: true }` (CQ8, fail-open)
  - Remove `setInterval` cleanup timer entirely (CQ22)
  - `rateLimitResponse()` unchanged
  - AC1.3 note: SIGTERM persistence is satisfied implicitly — every `rateLimit()` call commits atomically to SQLite (autocommit). No shutdown hook needed; state is durable after each call.
- [ ] Verify: `node -e "(async () => { const db = await import('./lib/db/index.js'); db.initDatabase(); const m = await import('./lib/rate-limit.js'); const r1 = m.rateLimit('test-key', 2, 60000); const r2 = m.rateLimit('test-key', 2, 60000); const r3 = m.rateLimit('test-key', 2, 60000); console.log(r1.allowed, r2.allowed, r3.allowed); })()"`
  Expected: `true true false`
- [ ] Acceptance: AC1.1, AC1.2, AC1.3 (implicit — per-call atomic commit), AC1.4, AC1.5
- [ ] Commit: `persist rate limiter state to SQLite for restart survival`

### Task 4: Break config → ai/agent circular dependency
**Files:** `lib/config.js`, `lib/ai/agent.js`
**Complexity:** standard
**Dependencies:** none
**Execution routing:** default

- [ ] RED: `npx madge --circular lib/config.js lib/ai/agent.js lib/ai/model.js`
  Expected: reports 1 circular dependency (config.js → agent.js via dynamic import)
- [ ] GREEN:
  **In `lib/config.js`:**
  - Add `globalThis.__popebotConfigInvalidateCb` registration slot
  - Add exported function: `export function onConfigInvalidate(cb) { globalThis.__popebotConfigInvalidateCb = cb; }`
  - In `invalidateConfigCache()`: replace `import('./ai/agent.js').then(...)` with `globalThis.__popebotConfigInvalidateCb?.();`
  
  **In `lib/ai/agent.js`:**
  - Add at module bottom: `import { onConfigInvalidate } from '../config.js'; onConfigInvalidate(resetAgentChats);`
  - This reverses the dependency: agent.js → config.js (already exists via model.js), not config.js → agent.js
  
  CQ23: `globalThis` ensures callback survives Next.js chunk duplication
- [ ] Verify: `npx madge --circular lib/config.js lib/ai/agent.js lib/ai/model.js`
  Expected: `No circular dependency found!` (or only the intra-module db/index → db/api-keys cycle, which is out of scope)
- [ ] Acceptance: AC4.1, AC4.2, AC4.3, AC4.4
- [ ] Commit: `break config→agent circular dependency via callback registration`

### Task 5: Extract inline Drizzle queries from route handlers to DAL
**Files:** `lib/db/chats.js`, `lib/chat/api.js`, `lib/chat/actions.js`
**Complexity:** complex
**Dependencies:** none
**Execution routing:** deep

- [ ] RED: `lib/chat/api.js` contains 3 inline Drizzle join queries (getChatsHandler ~lines 338-361, getChatDataHandler ~lines 408-424, getChatDataByWorkspaceHandler ~lines 429-452). `lib/chat/actions.js` getChats() ~lines 43-68 has identical join.
- [ ] GREEN:
  **Add to `lib/db/chats.js`:**
  1. `getChatsWithWorkspace(userId, telegramUserId = 'telegram', limit)` — returns array of `{ id, userId, title, starred, chatMode, codeWorkspaceId, containerName, hasChanges, createdAt, updatedAt }` via LEFT JOIN on codeWorkspaces. Uses `or(eq(chats.userId, userId), eq(chats.userId, telegramUserId))`, `desc(chats.updatedAt)`, optional limit.
  2. `getChatWithWorkspace(chatId)` — returns `{ ...chat, workspace: ws?.id ? ws : null }` or `null`. Single row via `.get()`.
  3. `getChatWithWorkspaceByWorkspaceId(workspaceId)` — returns `{ chatId: chat.id, ...chat, workspace: ws?.id ? ws : null }` or `null`. Note the `chatId` alias.
  
  **Modify `lib/chat/api.js`:**
  - `getChatsHandler`: replace inline query with `getChatsWithWorkspace(session.user.id, 'telegram', limit)`
  - `getChatDataHandler`: replace with `getChatWithWorkspace(chatId)` + ownership check
  - `getChatDataByWorkspaceHandler`: replace with `getChatWithWorkspaceByWorkspaceId(workspaceId)` + ownership check
  - Remove dynamic imports of `drizzle-orm`, `db/index.js`, `db/schema.js` from these handlers
  
  **Modify `lib/chat/actions.js`:**
  - `getChats()`: replace inline query with import + call to `getChatsWithWorkspace(user.id, 'telegram', limit)`
  - Remove dynamic imports of `drizzle-orm`, `db/index.js`, `db/schema.js` from this function
  
  CQ14: All 4 inline copies → 3 DAL functions. Zero duplication remaining.
- [ ] Verify: `node -e "(async () => { const db = await import('./lib/db/index.js'); db.initDatabase(); const chats = await import('./lib/db/chats.js'); const r = chats.getChatsWithWorkspace('test-user'); console.log(Array.isArray(r), typeof chats.getChatWithWorkspace === 'function', typeof chats.getChatWithWorkspaceByWorkspaceId === 'function'); })()"`
  Expected: `true true true` (functions exist and return expected types)
  Also verify: `grep -c "drizzle-orm" lib/chat/api.js` — Expected: `0` (no more inline Drizzle imports in migrated handlers)
- [ ] Acceptance: AC3.1, AC3.2, AC3.3, AC3.4
- [ ] Commit: `extract inline Drizzle queries from route handlers to DAL layer`

### Task 6: Migrate console.* in api/index.js to structured logger
**Files:** `api/index.js`
**Complexity:** standard
**Dependencies:** Task 2
**Execution routing:** default

- [ ] RED: `grep -c 'console\.' api/index.js` shows the current count of console calls
- [ ] GREEN:
  - Add `import { createLogger } from '../lib/logger.js';` at top
  - Add `const log = createLogger('api');`
  - Replace each `console.error(...)` with `log.error(...)` preserving the message and context
  - Replace `console.log(...)` with `log.info(...)`
  - CQ5: For `processChannelMessage` error handler, do NOT include raw message text in log meta (may contain user content). Log error.message only.
- [ ] Verify: `grep -c 'console\.' api/index.js`
  Expected: `0`
- [ ] Acceptance: AC2.5 (partial — api/index.js done)
- [ ] Commit: `migrate api/index.js logging to structured logger`

### Task 7: Migrate console.* in lib/chat/api.js to structured logger
**Files:** `lib/chat/api.js`
**Complexity:** standard
**Dependencies:** Task 2
**Execution routing:** default

- [ ] RED: `grep -c 'console\.' lib/chat/api.js` shows 3 console calls
- [ ] GREEN:
  - Add `import { createLogger } from '../logger.js';` at top
  - Add `const log = createLogger('chat/api');`
  - Replace `console.error('Chat stream error:', error)` → `log.error('chat stream error', { err: error.message })`
  - Replace `console.error('Failed to look up workspace:', err)` → `log.error('workspace lookup failed', { err: err.message })`
  - CQ5: Do NOT include full error stack at info level. Only `error.message` in meta.
- [ ] Verify: `grep -c 'console\.' lib/chat/api.js`
  Expected: `0`
- [ ] Acceptance: AC2.5 (partial — lib/chat/api.js done)
- [ ] Commit: `migrate lib/chat/api.js logging to structured logger`

### Task 8: Migrate console.* in config/instrumentation.js to structured logger
**Files:** `config/instrumentation.js`
**Complexity:** standard
**Dependencies:** Task 2
**Execution routing:** default

- [ ] RED: `grep -c 'console\.' config/instrumentation.js` shows console calls
- [ ] GREEN:
  - Add `const { createLogger } = await import('../lib/logger.js');` inside `register()` (after dotenv.config())
  - Add `const log = createLogger('boot');`
  - Replace `console.error(...)` → `log.error(...)`
  - Replace `console.warn(...)` → `log.warn(...)`
  - Replace `console.log('thepopebot initialized')` → `log.info('thepopebot initialized')`
  - Note: Use dynamic import because `register()` is async and logger may depend on env vars loaded by dotenv
- [ ] Verify: `grep -c 'console\.' config/instrumentation.js`
  Expected: `0`
- [ ] Acceptance: AC2.5 (complete — all 3 priority files done)
- [ ] Commit: `migrate config/instrumentation.js logging to structured logger`

### Task 9: Split lib/chat/actions.js into domain files (part 1 — core domains)
**Files:** `lib/chat/actions.js` (source), `lib/chat/actions/` (5 new files + barrel)
**Complexity:** complex
**Dependencies:** Task 5 (uses updated getChats that imports from db/chats.js)
**Execution routing:** deep
**Note:** This task touches 7+ files. This exceeds the 5-file guideline but is inherently atomic — a partial split would leave the barrel in an inconsistent state. Split into two tasks (9 and 10) to manage size.

- [ ] RED: `wc -l lib/chat/actions.js` → 1425 lines, 62 exports in a single file
- [ ] GREEN:
  Create directory `lib/chat/actions/` with these files (each starts with `'use server';`):
  
  1. **`chat.js`** (~150 LOC): `getChats`, `getChatMessages`, `createChat`, `deleteChat`, `renameChat`, `starChat`, `deleteAllChats`, `generateChatTitle`, `getChatData`, `getChatDataByWorkspace`. Include private `requireAuth()` and `requireAdmin()` helpers (5 lines each).
  
  2. **`workspace.js`** (~70 LOC): `createChatWorkspace`, `updateWorkspaceBranch`, `getWorkspace`. Include `requireAuth()`.
  
  3. **`notifications.js`** (~40 LOC): `getNotifications`, `getUnreadNotificationCount`, `markNotificationsRead`. Include `requireAuth()`.
  
  4. **`runners.js`** (~100 LOC): `getRunnersStatus`, `getRunnersConfig`, `stopDockerContainer`, `startDockerContainer`, `removeDockerContainer`. Include `requireAuth()`.
  
  5. **`pull-requests.js`** (~60 LOC): `getPullRequests`, `getPullRequestCount`, `getDefaultRepo`, `getRepositories`, `getBranches`. Include `requireAuth()`.
  
  6. **`index.js`** (barrel, ~20 LOC): `export * from './chat.js'; export * from './workspace.js'; export * from './notifications.js'; export * from './runners.js'; export * from './pull-requests.js';` + re-exports from remaining functions still in original actions.js (temporary — Task 10 completes the split). Also update `package.json` exports: `"./chat/actions": "./lib/chat/actions/index.js"`.
  
  **In this task:** Extract the simpler, smaller domain files first. Leave settings, github, admin functions in `lib/chat/actions/legacy.js` (moved from original `actions.js`, with `'use server'` + all remaining functions + `requireAuth`/`requireAdmin` helpers). The barrel re-exports from both the new domain files and `legacy.js`. This leaves a fully shippable codebase between Tasks 9 and 10.
  
  **Import audit:** Before starting the split, run `grep -rn "from.*chat/actions" lib/ web/` to identify all consumers. All should resolve via the barrel — no consumer should import a specific domain file directly.
  
  CQ14: `requireAuth()`/`requireAdmin()` duplicated per-file (5 lines each). Acceptable — sharing them would require a dedicated import that adds complexity for minimal savings.

- [ ] Verify:
  1. `ls lib/chat/actions/` — Expected: 7 files (5 domain + legacy.js + index.js)
  2. `grep -c "'use server'" lib/chat/actions/chat.js lib/chat/actions/runners.js` — Expected: `1` in each
  3. `node -e "import('./lib/chat/actions/index.js').then(m => console.log(Object.keys(m).length))"` — Expected: ~62 (all original exports accessible)
- [ ] Acceptance: AC5.1 (partial), AC5.3, AC5.4
- [ ] Commit: `split chat/actions.js phase 1 — extract chat, workspace, notifications, runners, pull-requests`

### Task 10: Complete actions.js split (part 2 — settings, github, admin)
**Files:** `lib/chat/actions/legacy.js` (source, delete after), `lib/chat/actions/` (3 new files)
**Complexity:** complex
**Dependencies:** Task 9
**Execution routing:** deep

- [ ] RED: `wc -l lib/chat/actions/legacy.js` — still >600 LOC across settings/github/admin domains
- [ ] GREEN:
  Split `legacy.js` into:
  
  1. **`settings-llm.js`** (~250 LOC): `getChatSettings`, `updateProviderCredential`, `addCustomProvider`, `updateCustomProvider`, `removeCustomProvider`, `setActiveLlm`, `getCodingAgentSettings`, `updateCodingAgentConfig`, `setCodingAgentDefault`, `getAvailableAgents`. Private `syncLitellmConfig()` stays here (called by 4 functions in this file). Include `requireAuth()` + `requireAdmin()`.
  
  2. **`settings-general.js`** (~200 LOC): `getGeneralSettings`, `updateGeneralSetting`, `getApiKeySettings`, `updateApiKeySetting`, `regenerateWebhookSecret`. Include `requireAdmin()`.
  
  3. **`github.js`** (~200 LOC): `getGitHubConfig`, `updateGitHubSecret`, `updateGitHubVariable`, `deleteGitHubVariableAction`, `getGitHubBranchProtection`, etc. Include `requireAdmin()`.
  
  4. **`admin.js`** (~280 LOC): `getAppVersion`, `triggerUpgrade`, `createNewApiKey`, `getApiKeys`, `deleteApiKey`, `createOAuthToken`, `getOAuthTokens`, `deleteOAuthToken`, `getAgentJobSecrets`, `updateAgentJobSecret`, `deleteAgentJobSecretAction`, `getAgentJobOAuthCredentials`, `getOAuthSecretCredentials`, `initiateOAuthFlow`. Include `requireAuth()` + `requireAdmin()`.
  
  Update barrel `index.js`: replace `export * from './legacy.js'` with exports from the 4 new files.
  
  **Delete** `lib/chat/actions/legacy.js`.
  **Delete** original `lib/chat/actions.js` if still present.
  
  AC5.5 compliance: `settings-llm.js` ~250 LOC, `settings-general.js` ~200 LOC, `admin.js` ~280 LOC — all under 300 LOC limit. (Original single `settings.js` at ~680 LOC would have violated AC5.5.)

- [ ] Verify:
  1. `ls lib/chat/actions/` — Expected: 10 files (9 domain + index.js)
  2. `grep -c "syncLitellmConfig" lib/chat/actions/index.js` — Expected: `0` (not re-exported)
  3. `node -e "import('./lib/chat/actions/index.js').then(m => console.log(Object.keys(m).length))"` — Expected: ~62 (all original exports accessible)
  4. `wc -l lib/chat/actions/settings-llm.js lib/chat/actions/settings-general.js lib/chat/actions/admin.js` — Expected: all <300 LOC
  5. Verify `lib/chat/actions.js` no longer exists (replaced by directory)
- [ ] Acceptance: AC5.1, AC5.2, AC5.3, AC5.4, AC5.5
- [ ] Commit: `split chat/actions.js phase 2 — extract settings, github, admin domains`
