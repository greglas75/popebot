# Spec: Architecture Fix Plan (Non-Test Items)

**spec_id:** arch-fixes-2026-04-08
**status:** Approved
**source:** `audit-results/architecture-review-2026-04-08.md` (adversarial-reviewed by 4 cross-provider models)
**date:** 2026-04-08
**author:** Greg Las + Claude (architecture review)
**scope:** A2, A3, A4, A5, A7 findings from architecture review
**excludes:** A6 (testability) — handled separately

## Context

Full architecture review scored thepopebot at 15/27 (56%). Security (A8=3) is excellent. The following non-test findings require remediation:

## Finding 1: Rate Limiter State Loss on Restart (A5, MEDIUM priority)

**Current state:** `lib/rate-limit.js` uses an in-memory `Map` for sliding-window rate limiting. All state is lost on process restart or deploy.

**Problem:** After restart, brute-force protection resets completely. An attacker who can trigger or observe restarts can bypass rate limits for the full window duration (60s).

**Acceptance Criteria:**
- AC1.1: Rate limiter state survives process restart
- AC1.2: On startup, previously recorded rate limit windows are restored
- AC1.3: Graceful shutdown (`SIGTERM`) persists current rate limit state
- AC1.4: Performance: read from SQLite adds <5ms latency per request (acceptable for self-hosted)
- AC1.5: Fallback: if SQLite persistence fails, in-memory mode continues working (no hard dependency)

**Files:** `lib/rate-limit.js`, `lib/db/schema.js`, `config/instrumentation.js`

## Finding 2: Unstructured Logging (A7, MEDIUM priority)

**Current state:** 185 `console.*` calls across 38 files. No log levels, no timestamps, no request IDs, no structured format.

**Problem:** Production debugging requires SSH + manual grep. No alerting. No way to trace a request through the system. Noisy container logs.

**Acceptance Criteria:**
- AC2.1: A centralized logger module exists at `lib/logger.js`
- AC2.2: Logger provides `info`, `warn`, `error`, `debug` methods
- AC2.3: Output is structured JSON: `{ level, timestamp, message, ...context }`
- AC2.4: Request ID can be threaded through log calls (optional context parameter)
- AC2.5: All `console.*` calls in `api/index.js`, `lib/chat/api.js`, and `config/instrumentation.js` are migrated to the logger (first 3 targets)
- AC2.6: `debug` level is suppressed unless `LOG_LEVEL=debug` env var is set
- AC2.7: No external dependencies — use Node.js built-in capabilities or minimal wrapper

**Files:** new `lib/logger.js`, `api/index.js`, `lib/chat/api.js`, `config/instrumentation.js`

## Finding 3: Inline DB Queries in Route Handlers (A2, LOW priority)

**Current state:** `lib/chat/api.js` contains inline Drizzle ORM queries (e.g., `getChatsHandler`, `getChatDataHandler`, `getChatDataByWorkspaceHandler`). These handlers directly construct and execute database queries instead of delegating to `lib/db/chats.js`.

**Problem:** Violates layering — route handlers should delegate to data access functions. Makes the handlers hard to test (can't mock the data layer) and creates duplication risk.

**Acceptance Criteria:**
- AC3.1: All inline Drizzle queries in `lib/chat/api.js` are extracted to functions in `lib/db/chats.js`
- AC3.2: Route handlers in `lib/chat/api.js` call the extracted functions instead of constructing queries
- AC3.3: Existing behavior is preserved — same query results, same response shapes
- AC3.4: No new dependencies added

**Files:** `lib/chat/api.js`, `lib/db/chats.js`

## Finding 4: Circular Dependency ai → config (A3, LOW priority)

**Current state:** `lib/config.js` line 159 does `import('./ai/agent.js').then(({ resetAgentChats }) => resetAgentChats())` inside `invalidateConfigCache()`. This creates a circular dependency: `ai/agent.js` → `ai/model.js` → `config.js` → `ai/agent.js`.

**Problem:** Structural concern. While runtime-safe due to dynamic `import()`, it violates dependency direction (infrastructure depends on domain). Makes the dependency graph harder to reason about.

**Acceptance Criteria:**
- AC4.1: `config.js` no longer imports from `ai/agent.js` (directly or dynamically)
- AC4.2: Agent chat singletons are still invalidated when config changes
- AC4.3: The solution uses a callback/event pattern (register a listener, not import the module)
- AC4.4: `npx madge --circular lib/config.js lib/ai/` reports 0 circular dependencies for this path

**Files:** `lib/config.js`, `lib/ai/agent.js`

## Finding 5: Decompose chat/actions.js (A4, LOW priority)

**Current state:** `lib/chat/actions.js` contains 62 exported functions (1,425 LOC) spanning 6+ domains: chat CRUD, notifications, API keys, OAuth tokens, GitHub, containers, admin settings.

**Problem:** File violates SRP at the module level. Changes to unrelated domains (e.g., API key management) touch the same file as chat operations, increasing merge conflict risk and cognitive load.

**Acceptance Criteria:**
- AC5.1: `lib/chat/actions.js` is split into domain-focused files
- AC5.2: Suggested split: `lib/chat/actions.js` (chat CRUD only), `lib/chat/actions/notifications.js`, `lib/chat/actions/api-keys.js`, `lib/chat/actions/github.js`, `lib/chat/actions/admin.js`, `lib/chat/actions/containers.js`
- AC5.3: All existing imports of functions from `lib/chat/actions.js` continue to work (re-export from original file or update import paths)
- AC5.4: No behavioral changes — pure refactoring
- AC5.5: Each new file is <300 LOC

**Files:** `lib/chat/actions.js`, new files in `lib/chat/actions/`

## Priority Order

1. Finding 1 (A5 rate limiter) — security implication
2. Finding 2 (A7 logger) — operational visibility
3. Finding 3 (A2 extract queries) — layering improvement
4. Finding 4 (A3 circular dep) — structural hygiene
5. Finding 5 (A4 decompose actions) — maintainability

## Constraints

- No new external npm dependencies (keep the package lightweight)
- All changes must work within the Docker overlay build pattern (fork's `lib/` is overlaid on npm package)
- JSX changes require `npm run build` before deploy
- SQLite schema changes require `npm run db:generate` migration workflow
