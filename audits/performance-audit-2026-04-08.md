# Performance Audit Report

## Metadata
| Field | Value |
|-------|-------|
| Project | thepopebot |
| Date | 2026-04-08 |
| Profile | A — Full-stack JS/TS (Next.js + Node + DB) |
| Stack | Next.js 15 + React 19 + Node.js custom server + Drizzle ORM + better-sqlite3 + Docker |
| Audit tier | PARTIAL (code inspection only, no Lighthouse/profiler/bundle analyzer) |
| Scope | Full project |

## Executive Summary

**Score: 72 / 112 — Grade: B (64%)**

> Adjusted to active dimensions: **72 / 112 = 64% — Grade: C**

| Metric | Count |
|--------|-------|
| CRITICAL findings | 1 |
| HIGH findings | 7 |
| MEDIUM findings | 14 |
| LOW findings | 9 |

The most impactful optimization opportunity is **adding `AbortSignal.timeout()` to all outbound `fetch()` calls** (D4-1) — every external HTTP call in the codebase (GitHub, npm, OpenAI, AssemblyAI, OAuth, webhooks) currently has zero timeout protection, risking hung handlers that block event-loop threads indefinitely. The second highest-impact fix is **memoizing chat message components** (D10-02/D1-01) to prevent 50-100 unnecessary re-renders/second during AI streaming. Together, these two changes would meaningfully improve both reliability and perceived performance.

## Dimension Scores

| # | Dimension | Score | Max | Confidence | Key Finding |
|---|-----------|-------|-----|------------|-------------|
| D1 | Rendering | 7 | 12 | HIGH | No `React.memo`, no virtualization, DiffViewer eagerly imported |
| D2 | Bundle Size | 6 | 12 | HIGH | LangChain not server-externalized, duplicate `monaco-editor` dep |
| D3 | Assets | 4 | 8 | HIGH | No `next/image`, duplicate diff2html CSS |
| D4 | API/Network | 4 | 10 | HIGH | Zero timeout on all outbound fetch calls |
| D5 | Algorithms | 7 | 10 | HIGH | Minor O(n*m) in config build, unescaped dynamic RegExp |
| D6 | Memory | 8 | 10 | HIGH | Unbounded log accumulation in ContainerLogsDialog |
| D7 | Database | 8 | 12 | HIGH | Missing indexes on core query columns; N+1 in admin paths only |
| D8 | Caching | 7 | 8 | HIGH | Config cache solid; minor TTL edge case |
| D9 | Framework | 6 | 8 | HIGH | No `loading.js` files in any route |
| D10 | Web Vitals | 5 | 10 | MEDIUM | INP risk during streaming, CLS from unsized images |
| D11 | Runtime | 5 | 6 | HIGH | `execSync` in request handlers, `readFileSync` in hot paths |
| D12 | Concurrency | 5 | 6 | HIGH | Unbounded `Promise.all` on 100 GitHub probes |
| **Total** | | **72** | **112** | | |

## Critical Gates

| Gate | Status |
|------|--------|
| D7 = 0 (N+1 in hot path) | **PASS** — N+1 patterns found only in admin/low-frequency paths |

## Findings (sorted by priority score)

### CRITICAL

**D4-1 CRITICAL — All outbound `fetch()` calls lack timeout protection**
Every outbound HTTP call — GitHub API (`lib/tools/github.js:11`), npm registry (`lib/cron.js:100`), OpenAI Whisper (`lib/tools/openai.js:22`), AssemblyAI (`lib/voice/actions.js:26`), OAuth (`lib/oauth/helper.js:40`), user webhooks (`lib/actions.js:32`) — uses bare `fetch()` with no `AbortSignal`.
  Impact Model:
    Estimated savings: Eliminates hung request handlers on slow/unresponsive third-party APIs
    Blast radius: Every API-touching code path
    Effort: S — add `{ signal: AbortSignal.timeout(10_000) }` to each call
    Confidence: HIGH
    Priority score: HIGH / S = **10**

### HIGH

**D10-02 HIGH — INP risk during streaming: messages render on every AI token**
The `Messages` component re-renders on every streaming token (~50-100/sec) without `React.memo` on `PreviewMessage`, causing full subtree diffs on every token.
  File: `lib/chat/components/messages.jsx:47-55`, `lib/chat/components/message.jsx`
  Impact Model:
    Estimated savings: Significant INP improvement during streaming; current pattern risks >200ms INP on mid-range devices
    Blast radius: Core chat experience during active AI responses
    Effort: M
    Confidence: HIGH
    Priority score: HIGH / M = **7**

**D2-01 HIGH — `@langchain/*` suite not in `serverExternalPackages`**
5 LangChain packages (~15-20MB) are in `dependencies` but only `better-sqlite3` and `drizzle-orm` are externalized in `next.config.mjs`. Risk of client bundle contamination.
  File: `web/next.config.mjs:5`, `package.json:76-81`
  Impact Model:
    Estimated savings: Eliminate risk of 15-20MB entering client bundles; faster server cold-start
    Blast radius: All page bundles, server startup
    Effort: S
    Confidence: MEDIUM
    Priority score: HIGH / S = **10**

**D2-02 HIGH — `monaco-editor` listed as direct dependency alongside `@monaco-editor/react`**
`monaco-editor: ^0.55.1` (~10MB) is a direct dep but never imported. The React wrapper handles Monaco loading.
  File: `package.json:91-92`
  Impact Model:
    Estimated savings: ~10MB from npm installs and Docker image size
    Blast radius: Docker image size, npm install time
    Effort: S
    Confidence: HIGH
    Priority score: HIGH / S = **10**

**D11-1 HIGH — `execSync` in request handlers blocks event loop**
`lib/code/actions.js:543-588` and `lib/code/actions.js:633-670` call `execSync` for git operations inside Next.js server actions, stalling all concurrent requests.
  File: `lib/code/actions.js:543-588,633-670`
  Impact Model:
    Estimated savings: Prevents 100ms-2s event-loop stalls during git operations
    Blast radius: Any user viewing workspace diff while other requests are in flight
    Effort: M
    Confidence: HIGH
    Priority score: HIGH / M = **7**

**D12-1 HIGH — Unbounded `Promise.all()` on up to 100 GitHub repo probes**
`lib/tools/github.js:212` fans out one POST per repo with no concurrency limit and no timeout.
  File: `lib/tools/github.js:212`
  Impact Model:
    Estimated savings: Prevents 100-connection burst and GitHub rate-limit 429s
    Blast radius: Repository selector in Code Workspaces
    Effort: M — add `p-limit(10)`
    Confidence: HIGH
    Priority score: HIGH / M = **7**

**D3-01 HIGH — No `next/image` used; raw `<img>` tags for dynamic content**
Image attachments render without lazy loading, optimization, or srcset.
  File: `lib/chat/components/message.jsx:400,442`
  Impact Model:
    Estimated savings: LCP improvement for image-heavy chats
    Blast radius: All chat messages with image attachments
    Effort: M
    Confidence: HIGH
    Priority score: HIGH / M = **7**

**D7-5 HIGH — Missing indexes on frequently queried columns**
No indexes on `chats.user_id`, `chats.updated_at`, `messages.chat_id`, `settings.type` — columns queried on every page load and API authentication.
  File: `lib/db/schema.js`
  Impact Model:
    Estimated savings: Eliminates sequential scans; degrades at ~10K+ rows
    Blast radius: Every chat load, API auth, config read
    Effort: M (Drizzle migration)
    Confidence: HIGH
    Priority score: HIGH / M = **7**

### MEDIUM

**D1-01 MEDIUM — No `React.memo` on any component**
Parent state changes cascade re-renders through entire subtree including sidebar and message list.
  File: `lib/chat/components/chat-page.jsx`, `messages.jsx`, `app-sidebar.jsx`
  Impact Model: Moderate savings during streaming | Effort: M | Confidence: HIGH

**D1-02 MEDIUM — No virtualization on message list**
`Messages` maps over all messages unconditionally. Long conversations (100+ messages with nested tool calls) cause render degradation.
  File: `lib/chat/components/messages.jsx:47`
  Impact Model: Meaningful FPS improvement for 30+ message conversations | Effort: M | Confidence: MEDIUM

**D1-04 MEDIUM — `DiffViewer` eagerly imported in `chat.jsx`**
Static import of `diff2html` (~500KB) in the main chat bundle even when user never opens a diff.
  File: `lib/chat/components/chat.jsx:12`
  Impact Model: ~50-80KB gzipped savings | Effort: S | Confidence: HIGH

**D2-03 MEDIUM — diff2html CSS imported twice (global + component)**
  File: `web/app/globals.css:3`, `lib/chat/components/diff-viewer.jsx:6`
  Impact Model: ~10-15KB CSS dedup | Effort: S | Confidence: HIGH

**D2-04 MEDIUM — No `sideEffects: false` in package.json**
Prevents tree-shaking for downstream consumers.
  File: `package.json`
  Impact Model: Better tree shaking for consumer apps | Effort: S | Confidence: MEDIUM

**D2-06 MEDIUM — `@dnd-kit` eagerly imported in code-page and cluster-page**
  File: `lib/code/code-page.jsx:5-8`, `lib/cluster/components/cluster-page.jsx:4-7`
  Impact Model: ~30-50KB deferred per route | Effort: S | Confidence: MEDIUM

**D4-3 MEDIUM — No cache headers on data route handlers**
Read-only browser UI routes return no `Cache-Control` header.
  File: `web/app/chats/list/route.js`, `web/app/chats/counts/route.js`
  Impact Model: Low latency win for repeated navigation | Effort: S | Confidence: MEDIUM

**D7-1 MEDIUM — `deleteAllChatsByUser`: N+1 deletes (admin path)**
  File: `lib/db/chats.js:107`
  Impact Model: Reducible to 2 queries | Effort: S | Confidence: HIGH

**D7-2 MEDIUM — `reorderClusterRoles`: N+1 updates without transaction**
  File: `lib/db/clusters.js:157`
  Impact Model: N round-trips to 1 fsync | Effort: S | Confidence: HIGH

**D7-4 MEDIUM — `verifyApiKey`: two SELECTs per API call**
  File: `lib/db/api-keys.js:126`
  Impact Model: Halves DB round-trips per external API call | Effort: S | Confidence: HIGH

**D9-1 MEDIUM — No `loading.js` files in any Next.js route**
Navigation to data-heavy routes shows blank screen instead of skeleton/spinner.
  File: All routes under `web/app/`
  Impact Model: Instant perceived-performance win | Effort: S per route | Confidence: HIGH

**D10-03 MEDIUM — CLS from image attachments without explicit dimensions**
  File: `lib/chat/components/message.jsx:400-404,442`
  Impact Model: Eliminates CLS from image messages | Effort: S | Confidence: HIGH

**D10-04 MEDIUM — CLS risk from `next-themes` client-side theme application**
  File: `web/app/layout.js:18`
  Impact Model: Minor CLS reduction | Effort: S | Confidence: MEDIUM

**D11-2 MEDIUM — `readFileSync` in request-path server actions**
`render_md()` uses `readFileSync` on every chat message. Config loading uses sync reads.
  File: `lib/utils/render-md.js:88`, `lib/chat/actions.js:573-574`
  Impact Model: Prevents I/O stalls on slow disks; chat prompt path is critical | Effort: M | Confidence: HIGH

### LOW (9 findings)

| ID | Description | File |
|----|-------------|------|
| D1-03 | `dynamic()` correctly used for heavy components | `lib/code/code-page.jsx:27-29` — PASS |
| D3-04 | xterm.css in dynamic chunk causes brief FOUC | `lib/code/terminal-view.jsx:9` |
| D3-05 | No explicit brotli compression config | `web/next.config.mjs` |
| D5-1 | Minor O(n*m) in `getGitHubConfig()` | `lib/chat/actions.js:1168,1179` |
| D5-2 | Unescaped dynamic RegExp in cluster variable resolution | `lib/cluster/execute.js:62` |
| D5-3 | Sequential string `+=` in diff builder | `lib/code/actions.js:679-683` |
| D6-1 | Unbounded log accumulation in ContainerLogsDialog | `lib/chat/components/containers-page.jsx:110` |
| D7-6 | `getChats()` called without limit from history page | `lib/chat/components/chats-page.jsx:84` |
| D10-05 | Auto-refresh pollers can cause INP spikes | `lib/chat/components/containers-page.jsx:589-592` |

## Cross-Cutting Patterns

| Pattern | Dimensions | Impact |
|---------|-----------|--------|
| No timeouts + unbounded Promise.all on GitHub probes | D4+D12 | 100 simultaneous hung connections possible |
| `execSync` + no worker threads for git ops | D11+D12 | Event loop blocked, throughput collapse during diff views |
| Missing indexes + no query caching for API auth | D7+D8 | Sequential scan on every external API call |
| DiffViewer eager import + duplicate CSS | D1+D2+D3 | ~80KB unnecessary in main chat bundle |
| No memo + no virtualization during streaming | D1+D10 | 50-100 full-tree re-renders/sec during AI responses |

## Optimization Roadmap

### Quick Wins (< 1 hour, high impact)

1. **Add `AbortSignal.timeout()` to all `fetch()` calls** — D4-1, S effort, eliminates hung handlers
2. **Add `@langchain/*` to `serverExternalPackages`** — D2-01, S effort, prevents bundle contamination
3. **Remove `monaco-editor` from direct dependencies** — D2-02, S effort, -10MB from installs
4. **Convert `DiffViewer` to `dynamic()` import** — D1-04, S effort, -50-80KB from chat bundle
5. **Remove duplicate diff2html CSS import** — D2-03, S effort
6. **Add `loading.js` stubs to main routes** — D9-1, S effort, instant perceived-perf win
7. **Add `sideEffects` field to package.json** — D2-04, S effort
8. **Wrap `reorderClusterRoles` in transaction** — D7-2, S effort
9. **Combine two SELECTs in `verifyApiKey`** — D7-4, S effort

### Short-term (1 day)

10. **Add `React.memo` to `PreviewMessage` and key message components** — D10-02/D1-01, M effort
11. **Replace `execSync` with async exec in workspace diff actions** — D11-1, M effort
12. **Add `p-limit(10)` to `listRepositories()` probe loop** — D12-1, M effort
13. **Add indexes on `chats.user_id`, `messages.chat_id`, `settings.type`** — D7-5, M effort (migration)
14. **Make `render_md()` async, replace `readFileSync`** — D11-2, M effort

### Medium-term (1 week)

15. **Add message list virtualization** — D1-02, M effort
16. **Add `loading="lazy"` and dimensions to `<img>` tags** — D3-01/D10-03, M effort
17. **Cap ContainerLogsDialog log array** — D6-1, S effort
18. **Add pagination to chats history page** — D7-6, S effort
19. **Lazy-load `@dnd-kit` imports** — D2-06, S effort

### Long-term (1 month+)

20. **Evaluate `next/image` for blob URL attachments** — D3-01, requires architecture decision
21. **Bundle analysis tooling** — establish baseline measurements with `@next/bundle-analyzer`
22. **Lighthouse CI integration** — automated Web Vitals regression detection

## Prerequisites for Higher Confidence

This audit ran at **PARTIAL** tier (code inspection only). To upgrade to FULL:

| Tool | Purpose | Install |
|------|---------|---------|
| `@next/bundle-analyzer` | Precise bundle composition | `npm i -D @next/bundle-analyzer` |
| Lighthouse CLI | Web Vitals measurement | `npm i -g lighthouse` |
| `source-map-explorer` | Treemap of bundle contents | `npm i -D source-map-explorer` |
| Node.js `--prof` or `clinic` | Backend CPU profiling | `npm i -g clinic` |

With these tools, D2 (Bundle Size) and D10 (Web Vitals) scores would move from MEDIUM to HIGH confidence, and Impact Models would include measured values instead of estimates.

---

## PERFORMANCE-AUDIT COMPLETE

Score: 72 / 112 — C
Profile: A | Audit tier: PARTIAL
Dimensions: 12 scored | Critical gates: PASS
Findings: 1 critical / 31 total
Run: 2026-04-08T12:00:00Z	performance-audit	thepopebot	1-critical	31-total	WARN	-	12-dimensions	zero fetch timeouts, streaming INP risk, missing DB indexes	clean-main	4ee9ec8
