# Tech Debt Backlog

## Critical

- **[A6] Add test infrastructure and critical-path tests** — Zero tests exist. Install vitest, test rate-limit.js, crypto.js, api/index.js checkAuth. Gate npm publish. Source: architecture-review-2026-04-08.
- **[A5] Harden rate limiter against restart bypass** — In-memory rate limiter state lost on restart creates brute-force attack window. Persist to SQLite or add startup grace period. Source: architecture-review-2026-04-08.

## Needs Work

- **[DB1] deleteAllChatsByUser N+1 deletes** — Loops individual DELETE per chat's messages. Replace with single `DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)`. Source: adversarial-review/chats.test.
- **[DB2] Multi-table operations lack transactions** — deleteChat, deleteAllChatsByUser, saveMessage perform multiple writes without transaction wrapper. Crash between writes leaves inconsistent state. Source: adversarial-review/chats.test.
- **[DB3] toggleChatStarred TOCTOU race** — Read-then-write pattern. Concurrent toggles may produce wrong result. Consider atomic `UPDATE SET starred = 1 - starred`. Source: adversarial-review/chats.test.

- **[A7] Introduce structured logging** — 185 console.* calls across 38 files. Replace with pino logger (level, timestamp, requestId). First targets: api/index.js, lib/chat/api.js, config/instrumentation.js. Source: architecture-review-2026-04-08.
- **[A2] Extract data access from route handlers** — lib/chat/api.js contains inline Drizzle queries. Move to lib/db/chats.js for testability and layer separation. Source: architecture-review-2026-04-08.
- **[A3] Break ai/config circular dependency** — config.js lazily imports ai/agent.js for resetAgentChats(). Extract into event emitter pattern. Source: architecture-review-2026-04-08.
- **[A4] Decompose lib/chat/actions.js** — 62 exported functions spanning chat CRUD, notifications, API keys, OAuth, GitHub, containers, admin. Split by domain. Source: architecture-review-2026-04-08.
