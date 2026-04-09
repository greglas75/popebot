# Architecture Review: thepopebot (TGM Fork)

**Date:** 2026-04-08
**Stack:** Next.js 15+ (App Router), React 19, LangGraph/LangChain, SQLite (Drizzle ORM), Docker, esbuild
**Scope:** Full codebase — `api/`, `lib/`, `config/`, `bin/`, `web/`, `setup/`, `templates/`
**Tools:** madge (circular deps), wc (LOC), git log (churn/temporal coupling), CodeSift (anti-patterns)
**Branch:** `clean-main` @ `81d620f`

## Overview

thepopebot is a self-hosted AI agent orchestration platform with a two-layer architecture: a Next.js Event Handler for chat UI, admin, and webhook processing, plus ephemeral Docker Agent containers for autonomous LLM tasks. The codebase is structured as an npm package consumed by user projects, with a Docker overlay pattern for fork customization. Module boundaries are generally well-defined, security is thorough (pentest-verified), but the complete absence of tests and unstructured logging are significant architectural risks.

## Architecture Style

**Detected:** Modular Monolith with Plugin Architecture (confidence: HIGH)
**Indicators:**
- npm package exports provide a clear public API surface
- `withThepopebot()` config wrapper pattern enables user extension
- Modules organized by domain concern (`ai/`, `auth/`, `chat/`, `db/`, etc.)
- Single deployment unit (Docker container) with internal module boundaries
- Channel adapter pattern (`lib/channels/`) supports multiple integrations

## Architecture Map

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Host (VPS)                        │
│                                                              │
│  ┌──────────────────────── Event Handler ──────────────────┐ │
│  │                                                          │ │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────────────────┐ │ │
│  │  │ Traefik │→ │ server.js │→ │     Next.js App         │ │ │
│  │  │ (TLS)   │  │ (custom)  │  │  ┌───────┐ ┌────────┐  │ │ │
│  │  └─────────┘  │ + WS proxy│  │  │web/app│ │/stream/ │  │ │ │
│  │               └──────────┘  │  │(pages) │ │  (SSE)  │  │ │ │
│  │                              │  └───┬───┘ └────┬───┘  │ │ │
│  │                              │      │          │       │ │ │
│  │  ┌──────────────────────────┼──────┴──────────┘       │ │ │
│  │  │        lib/ (npm package, overlaid in Docker)       │ │ │
│  │  │                                                      │ │ │
│  │  │  ┌─────────┐  ┌──────────┐  ┌──────────────────┐   │ │ │
│  │  │  │ auth/   │  │ chat/    │  │ ai/              │   │ │ │
│  │  │  │ NextAuth│  │ api.js   │  │ LangGraph agent  │   │ │ │
│  │  │  │ + middleware│ actions.js│  │ model resolver   │   │ │ │
│  │  │  └────┬────┘  └────┬─────┘  │ headless parser  │   │ │ │
│  │  │       │             │        └────────┬─────────┘   │ │ │
│  │  │  ┌────┴─────────────┴─────────────────┴──────────┐  │ │ │
│  │  │  │  db/ (SQLite + Drizzle ORM, WAL mode)         │  │ │ │
│  │  │  │  config.js → settings table (encrypted)       │  │ │ │
│  │  │  └───────────────────────────────────────────────┘  │ │ │
│  │  │                                                      │ │ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐    │ │ │
│  │  │  │ tools/   │  │ cluster/ │  │ code/          │    │ │ │
│  │  │  │ docker.js│  │ runtime  │  │ ws-proxy       │    │ │ │
│  │  │  │ github.js│  │ execute  │  │ terminal/editor│    │ │ │
│  │  │  └──────────┘  └──────────┘  └────────────────┘    │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                          │ │
│  │  ┌────────────────────┐  ┌──────────────────────────────┐│ │
│  │  │ api/index.js       │  │ config/instrumentation.js    ││ │
│  │  │ (external callers) │  │ (startup: DB, crons, cluster)││ │
│  │  └────────────────────┘  └──────────────────────────────┘│ │
│  └──────────────────────────────────────────────────────────┘ │
│                         │                                     │
│                    Docker Socket API                          │
│                         │                                     │
│  ┌──────────────────────┴──────────────────────────────────┐ │
│  │  Ephemeral Agent Containers                              │ │
│  │  (Claude Code, Pi, Gemini CLI, Codex CLI, etc.)         │ │
│  │  Clones agent-job/* branches, executes LLM tasks, PRs   │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

External integrations:
  ← Telegram webhooks (POST /api/telegram/webhook)
  ← GitHub webhooks (POST /api/github/webhook)
  → GitHub API (repos, PRs, agent jobs)
  → LLM APIs (Anthropic, OpenAI, Google, etc.)
  → AssemblyAI (voice transcription)
```

## Structural Metrics

### Module Size

| Module | LOC | Notes |
|--------|-----|-------|
| lib/chat | 25,332 | Largest — UI components + actions + API handlers |
| lib/code | 5,918 | Workspace terminal/editor + server actions |
| lib/cluster | 5,137 | Multi-container orchestration |
| setup | 2,327 | Interactive setup wizard |
| lib/db | 2,057 | Schema, migrations, CRUD |
| bin | 1,867 | CLI tools |
| lib/tools | 1,714 | Docker, GitHub, Telegram integrations |
| lib/ai | 1,399 | LLM agent, model resolver, stream parser |
| lib/auth | 952 | NextAuth config, middleware, components |
| api | 441 | External API route handler |
| lib/utils | 282 | Markdown renderer |
| lib/voice | 268 | Voice transcription |
| lib/containers | 267 | Container SSE streaming |
| lib/channels | 227 | Channel adapters (Telegram) |
| lib/oauth | 131 | OAuth token helpers |
| config | 119 | Next.js config wrapper |

**Note:** `lib/chat` at 25K LOC is ~50% of total codebase LOC. It comprises ~60 JSX component files + compiled JS outputs (no single file >1,425 LOC). The concentration is a decomposition candidate if the module continues to grow — current score reflects adequate internal file boundaries, not ideal module granularity.

### Cross-Module Fan-In / Fan-Out

| Module | Fan-Out (imports from) | Fan-In (imported by) | Instability (I) | Notes |
|--------|----------------------|---------------------|------------------|-------|
| db | 2 | 13 | 0.13 | Stable core — correctly abstract |
| auth | 2 | 8 | 0.20 | Stable — auth boundary layer |
| tools | 5 | 8 | 0.38 | Moderate — integration hub |
| ai | 6 | 4 | 0.60 | Moderate — high fan-out expected for orchestrator |
| chat | 5 | 0 | 1.00 | Leaf — UI/presentation module |
| cluster | 6 | 0 | 1.00 | Leaf — self-contained orchestrator |
| code | 2 | 0 | 1.00 | Leaf — workspace feature |
| containers | 3 | 0 | 1.00 | Leaf — SSE streaming |
| voice | 2 | 0 | 1.00 | Leaf — voice input |
| utils | 1 | 2 | 0.33 | Stable utility |
| channels | 1 | 0 | 1.00 | Leaf — Telegram adapter |
| oauth | 2 | 0 | 1.00 | Leaf — token helpers |

Instability profile is healthy: stable modules (db, auth) are abstract and widely imported. Unstable modules (chat, cluster, code) are concrete leaf modules with no dependents. No violations of the Stable Dependencies Principle.

### Circular Dependencies (2 found)

| # | Cycle | Severity | Root Cause |
|---|-------|----------|------------|
| 1 | `lib/ai/agent.js` → `lib/ai/model.js` → `lib/config.js` | Low | `config.js` lazily imports `ai/agent.js` for `resetAgentChats()` on config invalidation. Dynamic `import()` breaks the cycle at runtime. |
| 2 | `lib/db/index.js` → `lib/db/api-keys.js` | Low | Intra-module cycle. `index.js` imports `backfillLastUsedAt()` for migration. Runtime-safe due to deferred execution. |

Both cycles use dynamic `import()` or deferred execution, so they don't cause module resolution failures. Structural concern, not a runtime bug.

### Hidden Coupling (Temporal — Git History)

| Co-changes | File A | File B | Direct Import? | Verdict |
|-----------|--------|--------|----------------|---------|
| 5 | `lib/chat/components/messages.jsx` | `lib/utils/render-md.js` | No | Temporal coupling — messages renders markdown |
| 4 | `lib/chat/components/chat-input.jsx` | `lib/chat/components/messages.jsx` | No | Expected — same feature |
| 4 | `lib/chat/components/chat-input.jsx` | `lib/chat/components/chat.jsx` | No | Expected — parent/child |
| 3 | `lib/chat/api.js` | `lib/chat/components/chat.jsx` | No | Expected — API + UI |
| 3 | `lib/actions.js` | `lib/oauth/helper.js` | No | Temporal coupling — action dispatch + OAuth |

No alarming hidden dependencies. Analysis window: 6 months, minimum 3 co-changes, 20 pairs analyzed. Top 5 shown; full list reproducible via `git log --name-only`. The `messages.jsx` ↔ `render-md.js` coupling is expected (markdown rendering drives message display).

### Churn Hotspots (3 months)

| Changes | File | Risk |
|---------|------|------|
| 8 | `lib/chat/components/chat-input.jsx` | Active development area |
| 6 | `lib/utils/render-md.js` | Feature evolution |
| 6 | `lib/chat/components/messages.jsx` | Active development area |
| 6 | `lib/chat/components/chat.jsx` | Active development area |
| 6 | `lib/chat/api.js` | Active development area |
| 6 | `lib/chat/actions.js` | Active development area |

Churn concentrated in `lib/chat/` — the primary user-facing feature. Expected for an actively developed product.

### Anti-Pattern Scan

| Pattern | Matches | Status |
|---------|---------|--------|
| Empty catch blocks | 0 | Clean |
| Console in production | 0 (CodeSift) | Clean (see Observability note) |
| God functions (>100 lines) | 0 | Clean |

**Scan coverage disclosure:** Only 3 structural patterns checked. Common anti-patterns not scanned: deeply nested callbacks, magic numbers, hardcoded URLs, synchronous I/O in async paths, unbounded array growth, missing error propagation. For comprehensive anti-pattern coverage, use `zuvo:code-audit`.

**Console.* note:** 185 calls across 38 files. Spot-checked 40/185 (~22%): 34 were error handlers (`console.error` in catch blocks), 4 were startup messages (`console.log` in instrumentation), 2 were debug-adjacent (PR count fetch failure silently caught). No secret or request body leaks found in sample. However, all calls lack structure — see A7 assessment.

## Dimension Scores

| # | Dimension | Score (0-3) | Evidence | Confidence |
|---|-----------|-------------|----------|------------|
| A1 | **Modularity** | 2 | 15 top-level modules with CLAUDE.md contracts. Boundaries respected — leaf modules (chat, cluster, code) have zero fan-in. `lib/chat` is large (25K LOC) but cohesive. | HIGH |
| A2 | **Layering** | 2 | Clear layers: `web/app` → `lib/chat/api.js` → `lib/ai/` → `lib/db/`. Minor gap: some route handlers (`getChatsHandler`) contain inline Drizzle queries instead of delegating to a dedicated data access layer. | HIGH |
| A3 | **Dependency direction** | 2 | Dependencies mostly point inward. Stable core (db I=0.13, auth I=0.20). 2 circular deps exist but both use dynamic imports and are runtime-safe. | HIGH |
| A4 | **SRP + Anti-patterns** | 2 | No god functions detected. `lib/chat/actions.js` (1,425 LOC, 62 exported functions) groups server actions spanning chat CRUD, notifications, API keys, OAuth, GitHub, containers, and admin. Each function is small (avg ~23 LOC) but the file spans multiple domains — a decomposition candidate. `api/index.js` switch-case router is simple and clear. | HIGH |
| A5 | **Scalability** | 1 | Single-instance by design (SQLite, in-memory rate limiter, globalThis singletons). Rate limiter state lost on restart. Appropriate for self-hosted single-team use but becomes a constraint at scale. | HIGH |
| A6 | **Testability** | 0 | **Zero tests.** No test files, no test runner config, no CI test step. `npm test` outputs "No tests yet". Pure logic in lib/ is structurally testable but untested. | HIGH |
| A7 | **Observability** | 1 | 185 `console.*` calls across 38 files. No structured logging (no levels, no JSON format). No metrics, tracing, or correlation IDs. Error reporting relies on console.error. | HIGH |
| A8 | **Security boundary** | 3 | Comprehensive: timing-safe API key verification, session auth on all browser routes, admin role check in middleware, rate limiting, AES-256-GCM encrypted secrets, security headers, CSRF protection, ownership checks, Content-Type validation, media type whitelist. Pentest report: `pentest-results/pentest-report.md` (scope: auth, API routes, webhook secrets, input validation, SSRF — 10 findings remediated per `docs/FORK_SECURITY.md`). Pentest did not cover Docker socket exposure or container escape — those are mitigated by Traefik proxy isolation, not application code. | HIGH |
| A9 | **SOLID compliance** | 2 | SRP mostly followed. OCP via plugin pattern (`withThepopebot`, channel adapters). DIP via `config.js` abstraction and provider pattern. ISP via focused module exports. No formal interfaces (JS limitation). | MEDIUM |

**Total: 15/27 (56%) — Significant Issues**
**Critical gate: A1=2 A2=2 A3=2 A4=2 — PASS**

## Critical Issues

### A6: Zero Test Coverage

**Pattern:** The entire codebase has no automated tests. No unit, integration, or end-to-end tests exist. No test runner is configured.

**Risk:** Every code change is deployed without automated verification. Regressions can only be caught by manual testing or production failures. The 6+ active churn files in `lib/chat/` are modified frequently without safety nets. Security fixes (recent pentest findings) cannot be verified for non-regression.

**Fix:**
1. Install vitest (fast, ESM-native, zero-config for this stack): `npm i -D vitest`
2. Prioritize test coverage for high-risk areas:
   - `lib/rate-limit.js` — pure function, easy to test, security-critical
   - `lib/db/crypto.js` — encryption correctness is non-negotiable
   - `lib/config.js` — config resolution logic with fallback chains
   - `api/index.js` — auth gate, route matching, webhook verification
3. Add `"test": "vitest"` to `package.json` scripts
4. Add test step to CI (`publish-npm.yml`) as a publish gate

**Files:** `package.json`, new `__tests__/` or co-located `.test.js` files

## Needs-Work Items

### A5: Rate Limiter State Loss on Restart (Security Implication)

**Pattern:** In-memory sliding-window rate limiter (`lib/rate-limit.js`) loses all state on process restart or deploy. globalThis singletons assume single-instance.

**Risk:** After a crash, deploy, or intentional restart, rate limiting resets completely — creating a brute-force attack window for API key guessing or credential stuffing. An attacker who can trigger or observe restarts (e.g., by causing OOM via large payloads) can exploit this to bypass rate limits entirely. The window lasts until the rate limiter re-fills, which is `windowMs` (60 seconds for API, 60 seconds for chat).

**Fix (MEDIUM priority):**
1. Persist rate limit windows to SQLite: write current window state on graceful shutdown (`SIGTERM` handler), reload on startup
2. Alternatively, add a startup grace period with stricter limits (e.g., 5 requests/min for first 60s after restart)
3. Longer term: consider fail2ban-style IP blocking at the Traefik layer for repeated auth failures

**Files:** `lib/rate-limit.js`, `config/instrumentation.js` (for shutdown hook)

### A7: Unstructured Observability

**Pattern:** 185 `console.*` calls with no consistent format, no log levels, no correlation IDs. No metrics collection. No way to trace a request from webhook arrival through AI processing to response delivery.

**Risk:** Debugging production issues requires SSH + manual log grep. No alerting capability. Container logs are noisy without level filtering. Incident response time is high.

**Fix:**
1. Replace `console.*` with a minimal structured logger (e.g., pino — already common in Next.js): log level, timestamp, request ID
2. Add a request ID middleware that threads through the request lifecycle
3. Consider adding basic health metrics (request count, error rate, agent job duration)

**Files:** All 38 files with `console.*` calls, new `lib/logger.js`

## Strengths

1. **Security-first design (A8=3):** Comprehensive auth boundaries, encrypted secrets, rate limiting, pentest-verified fixes. The dual-auth pattern (API keys for external, sessions for browser) is correctly implemented with clear documentation.

2. **Well-documented module contracts:** Every module has a `CLAUDE.md` file documenting purpose, patterns, and constraints. The root `CLAUDE.md` provides a complete architectural reference. This is unusually thorough.

3. **Clean dependency graph:** Instability indexes follow the Stable Dependencies Principle. Core modules (db, auth) are stable and abstract. Leaf modules (chat, code, cluster) are concrete and independent. No SDP violations.

4. **Effective Docker overlay pattern:** The fork's `lib/` overlay approach lets the fork customize behavior without publishing to npm, while keeping upstream dependency clean. Documented in CLAUDE.md and Dockerfile.

5. **Singleton management for Next.js:** Correct use of `globalThis` to survive webpack chunk duplication — a common Next.js pitfall handled properly.

6. **Edge-safe auth split:** The `edge-config.js` / `config.js` separation for NextAuth prevents the common edge middleware crash from native module imports.

## Recommendations

1. **[HIGH] Add test infrastructure and critical-path tests.** This is the single highest-impact improvement. Start with pure functions (`rate-limit.js`, `crypto.js`, `config.js`) — these are easy wins that protect security-critical code. Gate npm publish on test pass. First 3 targets: `lib/rate-limit.js` (pure, security-critical), `lib/db/crypto.js` (encryption correctness), `api/index.js` `checkAuth` function (auth gate).

2. **[MEDIUM] Harden rate limiter against restart bypass.** Persist rate limit state to SQLite on shutdown, reload on startup. Or add a strict startup grace period. See A5 finding above for details.

3. **[MEDIUM] Introduce structured logging.** Replace `console.*` with a lightweight logger (pino recommended). First 3 files: `api/index.js` (auth gate), `lib/chat/api.js` (request handling), `config/instrumentation.js` (startup). Required interface: `{ level, timestamp, requestId?, message, ...context }`. Acceptance: `grep -c 'console\.' lib/ api/` returns 0 after migration.

4. **[LOW] Extract data access from route handlers.** Move inline Drizzle queries from `lib/chat/api.js` handlers into dedicated functions in `lib/db/chats.js`. This improves testability (mock the data layer) and keeps the layering clean.

5. **[LOW] Break the ai → config circular dependency.** Extract the `resetAgentChats()` callback into an event emitter or callback registration pattern so `config.js` doesn't need to import `ai/agent.js`.
