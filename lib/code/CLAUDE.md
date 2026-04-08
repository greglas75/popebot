# lib/code/ — Code Workspaces

## Data Flow

Chat agent's `coding_agent` tool → `runInteractiveContainer()` in `lib/tools/docker.js` → Docker container runs `coding-agent-claude-code` image (interactive runtime) with ttyd on port 7681 → browser navigates to `/code/{id}` → `TerminalView` (xterm.js) opens WebSocket → `ws-proxy.js` authenticates and proxies to container.

## WebSocket Auth

Middleware can't intercept WebSocket upgrades. `ws-proxy.js` authenticates directly:

1. Reads `authjs.session-token` cookie from the HTTP upgrade request headers
2. Decodes JWT using `next-auth/jwt` `decode()` with `AUTH_SECRET`
3. Rejects with 401 if no valid token, 403 if workspace not found
4. Proxies WebSocket bidirectionally to `ws://{containerName}:7681/ws`

## Container Recovery

`ensureCodeWorkspaceContainer(id)` in `actions.js` — inspects container state via Docker Engine API (Unix socket), restarts recoverable containers (stopped/exited/paused), recreates dead/missing ones. Returns `{ status: 'running' | 'started' | 'created' | 'no_container' | 'error' }`.

## Server Actions

All actions use `requireAuth()` with ownership checks: `getCodeWorkspaces()`, `createCodeWorkspace()`, `renameCodeWorkspace()`, `starCodeWorkspace()`, `deleteCodeWorkspace()`, `ensureCodeWorkspaceContainer()`.

## Multi-Agent Backends

Code workspaces support multiple coding agent backends. Agent selection is **global** via the `CODING_AGENT` config key (DB-backed, defaults to `claude-code`). There is no per-workspace agent selection — all workspaces use the globally configured agent.

**Supported agents**: `claude-code`, `pi`, `gemini-cli`, `codex-cli`, `opencode`. Each uses a different Docker image variant (`docker/coding-agent/Dockerfile.*`) and agent-specific setup/auth scripts in `docker/coding-agent/scripts/`.

**Configuration**: Users configure agents via `/admin/event-handler/coding-agents` — enable/disable agents, set per-agent auth mode (OAuth vs API key), provider, and model. `setCodingAgentDefault()` sets the global default. `buildAgentAuthEnv()` in `lib/tools/docker.js` resolves credentials from the settings DB at container launch time.

**Container streaming**: `lib/containers/stream.js` provides an SSE endpoint (`/stream/containers`) that polls Docker for container stats every 3 seconds. Used by the Containers admin page for live monitoring.

**Backend API in messages**: When an agent produces output, the `backendApi` field in message chunks identifies which agent backend generated the response.
