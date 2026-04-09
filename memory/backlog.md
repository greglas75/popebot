# Tech Debt Backlog

## Critical

- **[A6] Add test infrastructure and critical-path tests** — Zero tests exist. Install vitest, test rate-limit.js, crypto.js, api/index.js checkAuth. Gate npm publish. Source: architecture-review-2026-04-08.
- **[A5] Harden rate limiter against restart bypass** — In-memory rate limiter state lost on restart creates brute-force attack window. Persist to SQLite or add startup grace period. Source: architecture-review-2026-04-08.
- **[R1-b34c3a0] containerStartedAt never set — idle management resource leak** — lib/containers/lifecycle.js:126 reads containerStartedAt as fallback but no code sets it. Containers with no messages never idle-managed. Source: review-b34c3a0.
- **[R2-b34c3a0] ensureProject TOCTOU — no unique constraint, no transaction** — lib/db/projects.js:13-34 find-then-create without transaction. Schema lacks unique(userId, repo). Concurrent calls create duplicates. Source: review-b34c3a0.
- **[R3-b34c3a0] ensureContainer stuck state on failed unpause/start** — lib/containers/lifecycle.js:62-73. If container removed externally, unpause/start fails but DB status stays paused/stopped → infinite retry loop. Source: review-b34c3a0.

## Needs Work

- **[DB1] deleteAllChatsByUser N+1 deletes** — Loops individual DELETE per chat's messages. Replace with single `DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)`. Source: adversarial-review/chats.test.
- **[DB2] Multi-table operations lack transactions** — deleteChat, deleteAllChatsByUser, saveMessage perform multiple writes without transaction wrapper. Crash between writes leaves inconsistent state. Source: adversarial-review/chats.test.
- **[DB3] toggleChatStarred TOCTOU race** — Read-then-write pattern. Concurrent toggles may produce wrong result. Consider atomic `UPDATE SET starred = 1 - starred`. Source: adversarial-review/chats.test.

- **[A7] Introduce structured logging** — 185 console.* calls across 38 files. Replace with pino logger (level, timestamp, requestId). First targets: api/index.js, lib/chat/api.js, config/instrumentation.js. Source: architecture-review-2026-04-08.
- **[A2] Extract data access from route handlers** — lib/chat/api.js contains inline Drizzle queries. Move to lib/db/chats.js for testability and layer separation. Source: architecture-review-2026-04-08.
- **[A3] Break ai/config circular dependency** — config.js lazily imports ai/agent.js for resetAgentChats(). Extract into event emitter pattern. Source: architecture-review-2026-04-08.
- **[A4] Decompose lib/chat/actions.js** — 62 exported functions spanning chat CRUD, notifications, API keys, OAuth, GitHub, containers, admin. Split by domain. Source: architecture-review-2026-04-08.
- **[R4-b34c3a0] projects table missing userId index + unique constraint** — lib/db/schema.js:111-120. getProjectsByUser queries by userId with no index. Source: review-b34c3a0.
- **[R5-b34c3a0] Empty catch masks errors in waitForContainerReady** — lib/containers/lifecycle.js:242. Bare catch swallows Docker socket errors for 120s. Source: review-b34c3a0.
- **[R6-b34c3a0] Unbounded queries in getProjectsByUser + getWorkspacesForIdleManagement** — No LIMIT. Source: review-b34c3a0.
- **[R7-b34c3a0] execPrompt doesn't clean up stream on error** — lib/containers/lifecycle.js:268. No try/finally to destroy HTTP stream. Source: review-b34c3a0.
- **[R8-b34c3a0] updateContainerStatus accepts arbitrary strings** — lib/db/code-workspaces.js:179. No enum validation. Source: review-b34c3a0.

- ~~**[R1-8b2b5a8] Silent catch blocks in getCustomProviders/getCustomProvider**~~ — FIXED. console.warn added. Source: review-8b2b5a8.
- ~~**[R2-8b2b5a8] Test ordering dependency in Telegram webhook tests**~~ — FIXED (pre-existing on disk via _resetForTest). Source: review-8b2b5a8.
- **[D1-8b2b5a8] Test files exceeding 400L** — api/index.test.mjs 668L, config.test.mjs 640L, render-md.test.mjs 627L. Acceptable for large modules. Source: review-8b2b5a8. (dropped from report, confidence 45)
- **[D2-8b2b5a8] Missing Array.isArray guard for config.models** — lib/db/config.js:166. Pre-existing, low risk. Source: review-8b2b5a8/cross:gemini. (dropped from report, confidence 40)

- **[R1-9da0ee3] Project sidebar field mismatches** — project-sidebar.jsx:159 uses `project.threads` but API returns `recentChats`; :17 uses `container_status` but API returns `containerStatus`. MUST-FIX. Source: review-9da0ee3.
- **[R2-9da0ee3] Git actions report false success on 5s timeout** — api.js:625 `execInContainer` defaults 5s, returns null on timeout, handler reports success:true. MUST-FIX. Source: review-9da0ee3.
- **[R3-9da0ee3] getProjectsListHandler missing archived filter** — api.js:548 doesn't filter `eq(chats.archived, 0)` unlike getChats/getChatsHandler. MUST-FIX. Source: review-9da0ee3/cross:claude.
- **[R4-9da0ee3] N+1 query + no LIMIT in getProjectsListHandler** — api.js:536-562 runs separate query per project with no LIMIT. MUST-FIX. Source: review-9da0ee3.
- **[R5-9da0ee3] ensureContainer error passes undefined containerName** — ai/index.js:412. Docker error → 120s hang → confusing error. MUST-FIX. Source: review-9da0ee3.
- **[R6-9da0ee3] No concurrency guard on ensureContainer** — lifecycle.js:34-98 two messages race on Docker create. RECOMMENDED. Source: review-9da0ee3.
- **[R7-9da0ee3] execPrompt no timeout/cancellation** — ai/index.js:452 streaming exec can hang forever. RECOMMENDED. Source: review-9da0ee3.
- **[R8-9da0ee3] Warmup LLM response persisted on container failure** — ai/index.js:429 "starting up" text saved permanently. RECOMMENDED. Source: review-9da0ee3/cross:claude.
- **[R9-9da0ee3] updateLastMessageAt on failed exec** — ai/index.js:492 resets idle clock unconditionally. RECOMMENDED. Source: review-9da0ee3.
- **[R10-9da0ee3] Orphaned tool calls on stream interruption** — ai/index.js:461-475 tool invocations lost on crash. RECOMMENDED. Source: review-9da0ee3/cross:claude.
- **[R13-9da0ee3] create-branch action broken — no prompt for branch name** — git-toolbar.jsx:49 only prompts for 'commit', not 'create-branch'. Backend returns 400. MUST-FIX. Source: review-9da0ee3/ADV-6.
- **[R14-9da0ee3] err.message leaked to client** — ai/index.js:442 and api.js:629 return Docker error details to client. CQ5 violation. RECOMMENDED. Source: review-9da0ee3/CQ-auditor.
- **[D1-9da0ee3] TOCTOU container dies between check and exec** — api.js:590-625. Low impact, container sandbox. (dropped, confidence 45). Source: review-9da0ee3.
- **[D2-9da0ee3] No max-length guard on prompt to Docker exec** — lifecycle.js:294-318. Edge case. (dropped, confidence 40). Source: review-9da0ee3.
