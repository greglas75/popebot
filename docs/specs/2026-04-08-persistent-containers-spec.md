# Persistent Agent Containers — Design Specification

> **spec_id:** 2026-04-08-persistent-containers-2150
> **topic:** Persistent agent containers with project-based sidebar
> **status:** Approved
> **created_at:** 2026-04-08T21:50:00Z
> **approved_at:** 2026-04-08T22:15:00Z
> **approval_mode:** interactive
> **author:** zuvo:brainstorm

## Problem Statement

PopeBot's current chat architecture has three fundamental UX problems:

1. **Ephemeral containers**: Every message that needs code work spawns a new Docker container (~15-30s startup), which is destroyed after one prompt. Subsequent messages restart from scratch.

2. **Model confusion**: The chat LLM (router) and the coding agent (worker) are separate models. Users select "Sonnet 4.5" in the dropdown but a different model (the chat LLM) responds. The selected model only activates when a container eventually starts.

3. **Fragmented UX**: Agent mode vs Code mode, separate Interactive/Terminal page, flat chat list — users don't understand the difference or how the pieces connect.

If we do nothing, users continue to wait 15-30s per coding message, see responses from the wrong model, and struggle with a confusing multi-mode interface.

## Design Decisions

### D1: Persistent containers via `docker exec`

**Chosen**: Keep containers alive with tmux as the main process. Send prompts via `docker exec agent-cli -p "prompt" --resume`. No fifo, no named pipes.

**Why**: The interactive container infrastructure already exists. `docker exec` on a running container takes ~1-2s vs ~15-30s for a fresh container. Session continuity via `--resume` preserves conversation context. tmux keeps the container alive and enables terminal access simultaneously.

**Rejected**: Fifo-based prompt feeding (complex, fragile), MCP server approach (high effort, overkill for this use case).

### D2: Project-based sidebar (Antigravity-style)

**Chosen**: Replace Agent/Code mode split with project folders. Each project = a repo. Chats are threads under projects. Archive instead of delete.

**Why**: Users don't understand Agent vs Code. A project-based sidebar is intuitive — you pick a repo, you chat about it. Antigravity has validated this UX pattern.

**Rejected**: Keeping Agent/Code tabs with cosmetic changes (doesn't solve the confusion).

### D3: Inline terminal panel

**Chosen**: Terminal as a collapsible panel at the bottom of the chat view (like VS Code's integrated terminal). Expandable to half-screen or full-screen. Same container as the chat.

**Why**: No context switch to a separate `/code/{id}` page. Terminal and chat share the same container — what you do in terminal is visible in chat and vice versa.

**Rejected**: Separate terminal page (current design, forces context switch), terminal-only view (loses chat context).

### D4: Warm-start with cheap LLM

**Chosen**: When a chat opens, the cheap LLM (Haiku, GPT-mini) responds immediately while the container boots in the background (~15s). Once the container is ready, subsequent messages go directly to the selected agent via `docker exec`.

**Why**: Eliminates the cold-start wait. First response is instant. Agent takes over transparently once ready.

**Rejected**: No warmup (user stares at spinner for 15s), always-on containers (wastes RAM when no chats are active).

### D5: Remove interactive Jobs from chat UI

**Chosen**: No "Job" mode in the chat. The persistent container handles everything interactively — results stream to chat in real time. Crons and triggers still use ephemeral containers for automated background tasks.

**Why**: With persistent containers, fire-and-forget Jobs are redundant. Users see results immediately. Git actions (Commit, Push, Create PR) move to the toolbar.

**Rejected**: Keeping Job as a sub-mode (adds complexity, confusing UX with persistent containers).

### D6: Multi-agent support

**Chosen**: All five coding agents (Claude Code, Codex CLI, Gemini CLI, OpenCode, Kimi CLI) work with the persistent container model. Each agent has its own run script and session resume mechanism. The `docker exec` command adapts per agent type.

**Why**: Users switch between agents via the dropdown. The container image is agent-specific. Model override via env var or CLI flag.

### D7: Container lifecycle with idle management

**Chosen**: Tiered idle timeout with Docker pause/stop/remove.

| State | Trigger | RAM | Resume time |
|-------|---------|-----|-------------|
| Running | Active chat | ~200MB | instant |
| Paused | Idle > 30 min | ~100MB | ~1s |
| Stopped | Idle > 6 hours | 0 | ~3-5s |
| Removed | Idle > 7 days | 0 | ~15-30s |

**Why**: Balances resource usage with fast resume. Docker pause is nearly free (~100MB) and resumes instantly. A cron job every 5 minutes checks `lastMessageAt` and transitions containers through states.

## Solution Overview

```
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (project-based)                                │
│                                                         │
│  📁 popebot-instance                                    │
│     Chat about crons          2h                        │
│     Fix webhook handler       1d                        │
│                                                         │
│  📁 greglas75/my-app                                    │
│     Add auth middleware       5m  ● (container live)    │
│     Refactor API routes       3d                        │
│                                                         │
│  + Add project                                          │
├─────────────────────────────────────────────────────────┤
│  CHAT VIEW                                              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Toolbar: [Plan/Code▾] [Claude Code▾] [Sonnet▾] │    │
│  │          [⊙ Commit▾] [+7 -0]                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  User: "add rate limiting to /api/users"                │
│  Agent: [streaming response from container]             │
│  User: "looks good, commit it"                          │
│  Agent: "Committed abc1234"                             │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ ▼ Terminal (collapsible)                        │    │
│  │ coding-agent@workspace:~$ git log --oneline -3  │    │
│  │ abc1234 Add rate limiting                        │    │
│  │ def5678 Initial setup                            │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Message Flow

```
1. User opens chat (first time)
   ├── Container starts in background (RUNTIME=interactive, tmux + ttyd)
   ├── Chat LLM responds immediately: "Hi! What would you like to do?"
   └── Container reaches "ready" state → UI shows ● indicator

2. User sends coding message
   ├── docker exec <container> claude -p "prompt" --resume
   ├── Output streams back to chat via Docker logs API
   └── Agent finishes → container stays alive (tmux main process)

3. User sends another message
   ├── docker exec again → ~1-2s (container already running)
   └── Session context preserved via --resume

4. User clicks Terminal panel
   └── WebSocket connects to ttyd on port 7681 (same container)

5. User idle 30 min → Docker pause (100MB)
6. User returns → Docker unpause (~1s) → docker exec
```

## Detailed Design

### Data Model

**Modified table: `chats`**

```sql
-- Remove chatMode column ('agent'/'code' distinction gone)
-- Add:
ALTER TABLE chats ADD COLUMN project_id TEXT REFERENCES projects(id);
```

**New table: `projects`**

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  repo TEXT NOT NULL,           -- 'greglas75/my-app' or 'popebot-instance'
  title TEXT,                   -- display name
  default_branch TEXT DEFAULT 'main',
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Modified table: `code_workspaces`**

```sql
-- Add:
ALTER TABLE code_workspaces ADD COLUMN container_status TEXT DEFAULT 'none';
  -- Values: 'none' | 'starting' | 'ready' | 'paused' | 'stopped'
ALTER TABLE code_workspaces ADD COLUMN last_message_at TEXT;
ALTER TABLE code_workspaces ADD COLUMN container_started_at TEXT;
```

### Container Management

**New module: `lib/containers/lifecycle.js`**

Responsible for the persistent container lifecycle:

```javascript
// Start or resume a container for a workspace
async function ensureContainer(workspaceId) → { status, containerName }
  // 1. Check DB for container_status
  // 2. If 'ready' → inspect Docker, verify running → return
  // 3. If 'paused' → docker unpause → update status → return
  // 4. If 'stopped' → docker start → update status → return
  // 5. If 'none'/'starting' → create new interactive container → return

// Execute a prompt in a running container (STREAMING)
async function execPrompt(containerName, agent, prompt, options) → AsyncIterable<chunk>
  // 1. Create exec instance via POST /containers/{id}/exec
  // 2. Attach with stream via POST /exec/{execId}/start
  // 3. Returns http.IncomingMessage (raw stream, like tailContainerLogs)
  // 4. Parse multiplexed Docker frames via DockerFrameParser (reuse from headless-stream.js)
  // 5. Parse NDJSON lines via mapLine() (reuse from line-mappers.js)
  // 6. Update last_message_at

// Idle management (called by cron every 5 min)
async function manageIdleContainers()
  // For each workspace with active container:
  //   idle > 30 min → docker pause, set status 'paused'
  //   idle > 6 hours → docker stop, set status 'stopped'
  //   idle > 7 days → docker remove, set status 'none'
```

**Required additions to `lib/tools/docker.js`:**

```javascript
// New functions needed:
async function pauseContainer(containerName)
  // POST /containers/{name}/pause via Docker Engine API

async function unpauseContainer(containerName)
  // POST /containers/{name}/unpause via Docker Engine API

async function execStreamInContainer(containerName, cmd)
  // 1. POST /containers/{name}/exec { Cmd: cmd, AttachStdout: true, AttachStderr: true }
  // 2. POST /exec/{execId}/start { Detach: false, Tty: false }
  // 3. Returns http.IncomingMessage (multiplexed stream, same format as container logs)
  // Reuses existing dockerApi() and DockerFrameParser infrastructure
```

**Agent exec commands** (per agent type):

| Agent | Exec command | Resume mechanism |
|-------|-------------|-----------------|
| claude-code | `claude -p "$PROMPT" --resume $SID --output-format stream-json` | Native `--resume` flag + session file in workspace |
| codex-cli | `codex -q "$PROMPT"` | `CONTINUE_SESSION=1` env + workspace files |
| gemini-cli | `gemini -p "$PROMPT"` | `CONTINUE_SESSION=1` env + workspace files |
| opencode | `opencode run "$PROMPT"` | `CONTINUE_SESSION=1` env + workspace files |
| kimi-cli | `kimi -p "$PROMPT"` | `CONTINUE_SESSION=1` env + workspace files |

**Resume strategy**: Claude Code has native `--resume` with session IDs. Other agents rely on file-level continuity: the workspace bind mount (`/home/coding-agent`) persists git state, code changes, and config between exec invocations. `CONTINUE_SESSION=1` is set at container start time and applies to all exec invocations. This provides adequate continuity even without native session resume — the agent sees the current repo state and can build on prior work.

### Chat Streaming (modified `lib/ai/index.js`)

Replace the current flow:

```javascript
async function* chatStream(threadId, message, attachments, options) {
  // 1. Resolve project + workspace
  // 2. Ensure container is running (ensureContainer)
  
  if (containerStatus !== 'ready') {
    // Container still booting — try cheap LLM for first response
    const hasLLM = !!getConfig('LLM_PROVIDER');
    if (hasLLM) {
      // Cheap LLM available → respond immediately while container boots
      const cheapModel = await createModel();
      yield* cheapLLMResponse(cheapModel, message);
    } else {
      // No chat LLM configured → show progress indicator
      yield { type: 'status', status: 'container-starting', message: 'Agent starting...' };
    }
    // Wait for container ready (poll every 1s, timeout 120s)
    await waitForContainerReady(workspaceId);
  }
  
  // 3. Route message to container via docker exec (streaming)
  const chunks = execPrompt(containerName, agent, message, options);
  for await (const chunk of chunks) {
    yield chunk;
  }
  
  // 4. Update last_message_at
}
```

**Cheap LLM fallback**: If `LLM_PROVIDER` is not configured (user only has OAuth), the warmup phase shows "Agent starting..." instead of a cheap LLM response. The user waits ~15s for the first message but pays zero API cost. Subsequent messages are instant (~1-2s) since the container is already running.

### Sidebar UI (`lib/chat/components/`)

**New component: `ProjectSidebar`**

```
Projects
─────────────────
📁 popebot-instance  ▾
   ├── Fix cron schedule      5m  ●
   ├── Update webhook handler 2h
   └── See all (8)

📁 greglas75/zuvo-plugin  ▾
   ├── Run benchmark          7h
   ├── Oceń a11y-audit        1d
   └── See all (12)

[+ Add project]
```

Features:
- Collapsible project folders
- Chat threads under each project
- Green dot = container running
- "See all (N)" expandable
- Right-click → Archive thread / Delete
- Drag to reorder projects

**Removed:**
- Agent/Code tabs
- Mode toggle (Agent ↔ Code)

**Kept:**
- Sub-mode selector: Plan / Code (permission level for the agent)
- Agent selector: Claude Code / Codex / Gemini / etc.
- Model selector: Sonnet 4.5 / Opus 4 / etc. (with API tag)

### Terminal Panel (`lib/chat/components/terminal-panel.jsx`)

New component — collapsible panel at the bottom of chat:

- **Collapsed**: thin bar "▸ Terminal" (click to expand)
- **Half-screen**: split view — chat on top, terminal on bottom (draggable divider)
- **Full-screen**: terminal fills the entire view (ESC to go back)
- WebSocket connection to same container's ttyd (port 7681)
- xterm.js rendering (reuse existing `TerminalView` component)

### Git Actions Toolbar

Move git operations from agent_job / PR flow to toolbar buttons:

```
[Plan ▾] [Claude Code ▾] [Sonnet 4.5 ▾]  |  [⊙ Commit ▾] [+7 -0]
                                               ├── Commit
                                               ├── Push
                                               ├── Create PR
                                               └── Create branch
```

These execute `docker exec` commands on the persistent container:
- Commit: `docker exec <c> git -C /home/coding-agent/workspace add -A && git commit -m "..."`
- Push: `docker exec <c> git -C /home/coding-agent/workspace push`
- Create PR: `docker exec <c> gh pr create ...`

### Integration Points

| Component | File | Change |
|-----------|------|--------|
| Chat streaming | `lib/ai/index.js` | Replace LangGraph agent flow with `ensureContainer` + `execPrompt` |
| Container lifecycle | `lib/containers/lifecycle.js` | **New file** — persistent container management |
| Docker operations | `lib/tools/docker.js` | Add `execInContainer()`, modify `runInteractiveContainer()` |
| DB schema | `lib/db/schema.js` | Add `projects` table, modify `chats` and `code_workspaces` |
| Sidebar | `lib/chat/components/` | New `ProjectSidebar`, remove mode toggle |
| Terminal | `lib/chat/components/terminal-panel.jsx` | **New file** — inline terminal |
| Chat input | `lib/chat/components/chat-input.jsx` | Remove Interactive toggle, add git toolbar |
| Idle cleanup | `lib/cron.js` | Add `manageIdleContainers` cron (every 5 min) |
| Headless stream | `lib/ai/headless-stream.js` | Reuse for `docker exec` output parsing |
| Agent tools | `lib/ai/tools.js` | Simplify — remove container create/destroy per message |
| Agent singleton | `lib/ai/agent.js` | Merge into one agent or remove LangGraph dependency |
| Entrypoint | `docker/coding-agent/entrypoint.sh` | Ensure interactive mode starts tmux + ttyd always |
| WS proxy | `lib/code/ws-proxy.js` | Route terminal panel WebSocket to container |

### Edge Cases

| Edge Case | Strategy |
|-----------|----------|
| Container crashes mid-conversation | `ensureContainer()` detects missing container → recreates. Chat shows "Agent restarting..." |
| Server restarts with running containers | Startup audit: inspect all containers in DB, update `container_status` to match Docker state |
| User switches agent (Claude → Gemini) | Stop current container, start new one with different image. Warn "switching agent restarts container" |
| User switches model (Sonnet → Opus) | `docker exec` with model override env var. No container restart needed |
| 10 chats open = 10 containers | Soft limit: warn at 5. Hard limit: block at 10 per user. Auto-pause oldest idle |
| Container uses too much RAM | Monitor via `getContainerStats()`. Warn at 1.8GB. Auto-commit + pause at 1.95GB |
| User closes tab while container boots | Container finishes starting. Cleaned up by idle cron after 30 min |
| Telegram messages | Route to a shared "telegram" project container. One persistent container for all Telegram messages |

## Acceptance Criteria

1. Opening a chat with an existing project calls `ensureContainer()` — container starts in background, chat UI loads immediately
2. First message: if chat LLM configured → response within 2s (cheap LLM). If no chat LLM → "Agent starting..." status within 200ms
3. Container reaches 'ready' status within 60s of first message (measured from `ensureContainer()` call to first successful `docker exec`)
4. Messages to a running container: first response byte within 3s of send (measured via `docker exec` attach → first stdout frame)
5. Terminal panel at the bottom of chat connects to the same container's ttyd (port 7681) via existing WebSocket proxy
6. Terminal panel: collapsed (thin bar) → half-screen (draggable divider) → full-screen (ESC to return)
7. Sidebar shows projects as collapsible folders with threads underneath. No Agent/Code tabs
8. Idle cron runs every 5 min. Containers with `last_message_at` older than 30 min → `pauseContainer()`. Older than 6h → `stopContainer()`. Older than 7d → `removeContainer()`
9. `unpauseContainer()` completes within 2s. Verified by: pause container, send message, measure time to first response byte
10. All five agents work: verified by creating a persistent container with each agent image and running `docker exec` with the agent's CLI command
11. Model change mid-session: `execPrompt()` passes model override as env var to `docker exec`. No container restart. Verified by switching model and confirming different model in response metadata
12. Git actions (Commit, Push, Create PR, Create branch) execute via `execStreamInContainer()` on the persistent container
13. Chat threads have "Archive" action (moves to archived list, recoverable) in addition to delete
14. `ensureContainer()` detects missing/dead container via `inspectContainer()` → recreates automatically. Chat shows "Agent restarting..." status event
15. Per-user container limit: configurable via `MAX_CONTAINERS_PER_USER` (default 10). 96GB VPS ÷ 200MB per running container = ~480 theoretical max. 10 per user is conservative for multi-user safety

## Out of Scope

- Cron/trigger automation changes (ephemeral containers, no UI change)
- Multi-user container sharing (each user gets their own containers)
- Container-to-container networking (each container is isolated)
- Mobile-specific UI optimizations
- Telegram UI changes (backend routing only)
- Voice input changes
- Admin panel redesign

## Migration Strategy

One-time migration script runs on first startup after deploy:

1. **Create projects from existing workspaces**: For each unique `repo` in `code_workspaces`, create a `projects` row
2. **Assign chats to projects**: For each chat with `codeWorkspaceId`, set `project_id` from the workspace's project
3. **Orphaned chats** (no workspace): assign to a default "General" project
4. **Remove `chatMode` column** after migration (both Agent and Code chats become regular chats under projects)

Migration is idempotent — safe to run multiple times. Implemented as a Drizzle migration in `lib/db/migrations/`.

## Open Questions

1. **Docker exec streaming format**: The Docker Engine API's exec attach endpoint returns multiplexed frames (same 8-byte header as container logs). Need to verify that `DockerFrameParser` handles exec output identically — likely yes, but needs a manual test
2. **Project auto-creation**: When user selects a new repo in the repo picker, should a project be auto-created? Recommendation: yes, auto-create on first chat with a new repo
3. **Concurrent exec calls**: What happens if user sends two messages quickly before first exec finishes? Recommendation: queue messages, process sequentially per container (one exec at a time)
