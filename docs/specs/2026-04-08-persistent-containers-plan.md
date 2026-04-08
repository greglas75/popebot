# Implementation Plan: Persistent Agent Containers

**Spec:** docs/specs/2026-04-08-persistent-containers-spec.md
**spec_id:** 2026-04-08-persistent-containers-2150
**plan_revision:** 1
**status:** Approved
**Created:** 2026-04-08
**Tasks:** 18
**Estimated complexity:** 6 standard, 12 complex

## Architecture Summary

Replace ephemeral containers (new per message, ~15-30s) with persistent containers (one per chat, `docker exec` ~1-2s). tmux is the main process; agent CLI invoked via `docker exec`. Terminal panel inline at bottom of chat. Project-based sidebar replaces Agent/Code modes.

Key components:
- `lib/containers/lifecycle.js` (NEW) — ensureContainer, execPrompt, idle management
- `lib/tools/docker.js` (EXTEND) — pauseContainer, unpauseContainer, execStreamInContainer
- `lib/db/projects.js` (NEW) — project CRUD
- `lib/db/schema.js` (MODIFY) — projects table, code_workspaces columns
- `lib/ai/index.js` (MODIFY) — chatStream persistent path
- `lib/chat/components/` (NEW+MODIFY) — ProjectSidebar, TerminalPanel, GitToolbar

## Technical Decisions

- **Docker exec streaming**: Reuse `dockerApiStream()` + `DockerFrameParser` from existing logs infrastructure
- **Schema**: Drizzle migrations — add projects table, 3 columns to code_workspaces, project_id to chats
- **Chat streaming**: New condition in chatStream() before LangGraph — if persistent container, bypass agent, use `execPrompt()` directly
- **Sidebar**: Compose ProjectSidebar inside existing AppSidebar (don't replace entire component)
- **Terminal**: Reuse existing TerminalView (xterm.js) inside new collapsible TerminalPanel wrapper
- **Entrypoint**: RUNTIME=interactive already starts tmux+ttyd — no Docker image changes needed

## Quality Strategy

- Mock Docker socket for unit tests (`dockerApi()` calls)
- Real Docker for integration tests (exec streaming format, pause/unpause timing)
- Highest risk: CQ4 (error handling on container crash), CQ6 (async stream cleanup), CQ7 (DB-Docker state sync)
- 8 new test files, 4 modified, ~2500 lines of test code

---

## Task Breakdown

### Task 1: Add Docker pause/unpause/exec functions
**Files:** `lib/tools/docker.js`
**Complexity:** standard
**Dependencies:** none
**Execution routing:** default implementation tier

- [ ] RED: Add test in `lib/tools/docker.test.mjs` — verify `pauseContainer(name)` calls `POST /containers/{name}/pause`, `unpauseContainer(name)` calls `POST /containers/{name}/unpause`, `execStreamInContainer(name, cmd)` creates exec instance then attaches stream. Mock `dockerApi()` and `dockerApiStream()`.
- [ ] GREEN: Implement three functions in `docker.js`:
  - `pauseContainer(name)` → `dockerApi('POST', '/containers/{name}/pause')`
  - `unpauseContainer(name)` → `dockerApi('POST', '/containers/{name}/unpause')`
  - `execStreamInContainer(name, cmd)` → create exec via `dockerApi('POST', '/containers/{name}/exec', {Cmd, AttachStdout, AttachStderr})` then `dockerApiStream('POST', '/exec/{id}/start', {Detach:false})`
  - Export all three.
- [ ] Verify: `npx vitest run lib/tools/docker.test.mjs`
  Expected: all new tests pass
- [ ] Acceptance: Foundation for AC #4, #8, #9
- [ ] Commit: `feat: add pauseContainer, unpauseContainer, execStreamInContainer to Docker API`

### Task 2: Extend DB schema — projects table + workspace columns
**Files:** `lib/db/schema.js`
**Complexity:** standard
**Dependencies:** none
**Execution routing:** default implementation tier

- [ ] RED: Test that `projects` table exists after migration, that `code_workspaces` has `container_status`, `last_message_at`, `container_started_at` columns, and `chats` has `project_id`.
- [ ] GREEN: In `schema.js`:
  - Add `projects` table (id, userId, repo, title, defaultBranch, archived, createdAt, updatedAt)
  - Add `containerStatus`, `lastMessageAt`, `containerStartedAt` to `codeWorkspaces`
  - Add `projectId` to `chats`
  - Run `npm run db:generate` to create migration
- [ ] Verify: `npm run db:generate && npx vitest run lib/db/schema.test.mjs`
  Expected: migration generated, schema test passes
- [ ] Acceptance: Foundation for all DB-dependent tasks
- [ ] Commit: `feat: add projects table and persistent container columns to schema`

### Task 3: Projects CRUD operations
**Files:** `lib/db/projects.js` (NEW)
**Complexity:** standard
**Dependencies:** Task 2
**Execution routing:** default implementation tier

- [ ] RED: Test `ensureProject(userId, repo)` creates project if not exists, returns existing if it does. Test `getProjectsByUser(userId)` returns sorted list. Test `archiveProject(id)` sets archived=1.
- [ ] GREEN: Create `lib/db/projects.js` with:
  - `ensureProject(userId, repo)` — upsert by userId+repo
  - `getProjectById(id)`
  - `getProjectsByUser(userId, includeArchived?)`
  - `archiveProject(projectId)`
- [ ] Verify: `npx vitest run lib/db/projects.test.mjs`
  Expected: all CRUD tests pass
- [ ] Acceptance: AC #7 (sidebar data), AC #13 (archive)
- [ ] Commit: `feat: add projects CRUD with ensureProject upsert`

### Task 4: Extend code-workspaces with container status tracking
**Files:** `lib/db/code-workspaces.js`
**Complexity:** standard
**Dependencies:** Task 2
**Execution routing:** default implementation tier

- [ ] RED: Test `updateContainerStatus(wsId, 'ready')` updates DB. Test `updateLastMessageAt(wsId)` sets current timestamp. Test `getWorkspacesForIdleManagement(30*60*1000)` returns workspaces idle > 30min.
- [ ] GREEN: Add to `code-workspaces.js`:
  - `updateContainerStatus(workspaceId, status)`
  - `updateLastMessageAt(workspaceId)`
  - `getWorkspacesForIdleManagement(minIdleMs)`
- [ ] Verify: `npx vitest run lib/db/code-workspaces.test.mjs`
  Expected: all new tests pass
- [ ] Acceptance: AC #8 (idle management data)
- [ ] Commit: `feat: add container status and idle tracking to code-workspaces`

### Task 5: Container lifecycle — ensureContainer
**Files:** `lib/containers/lifecycle.js` (NEW)
**Complexity:** complex
**Dependencies:** Task 1, Task 4
**Execution routing:** deep implementation tier

- [ ] RED: Test state machine: `ensureContainer(wsId)` when status='none' → calls `runInteractiveContainer`, returns {status:'starting'}. When 'paused' → calls `unpauseContainer`, returns {status:'ready'}. When 'stopped' → calls `startContainer`. When 'ready' → inspects Docker, returns if running, recreates if dead.
- [ ] GREEN: Implement `ensureContainer(workspaceId, options)`:
  - Read workspace from DB
  - Switch on `containerStatus`: none→create, starting→return, ready→verify, paused→unpause, stopped→start
  - On dead container (inspectContainer returns null) → removeContainer + recreate
  - Update `containerStatus` in DB at each transition
  - Return `{status, containerName}`
- [ ] Verify: `npx vitest run lib/containers/lifecycle.test.mjs`
  Expected: all state transition tests pass
- [ ] Acceptance: AC #1, #14 (container start + crash recovery)
- [ ] Commit: `feat: container lifecycle state machine with crash recovery`

### Task 6: Container lifecycle — execPrompt (streaming)
**Files:** `lib/containers/lifecycle.js`
**Complexity:** complex
**Dependencies:** Task 1, Task 5
**Execution routing:** deep implementation tier

- [ ] RED: Test `execPrompt(containerName, 'claude-code', 'hello', {})` builds correct exec command (`claude -p "hello" --resume --output-format stream-json`). Test for each of 5 agents. Test it yields parsed chunks (mock `execStreamInContainer` + `parseHeadlessStream`).
- [ ] GREEN: Implement `execPrompt(containerName, agent, prompt, options)`:
  - Build agent-specific CLI command (claude-code, codex-cli, gemini-cli, opencode, kimi-cli)
  - Call `execStreamInContainer(containerName, cmd)`
  - Pipe through `parseHeadlessStream(stream, agent)` (reuse existing)
  - Yield chunks as AsyncIterable
  - Handle model override via CLI flag or env var
- [ ] Verify: `npx vitest run lib/containers/lifecycle.test.mjs`
  Expected: exec command tests pass for all 5 agents
- [ ] Acceptance: AC #4 (response within 3s), AC #10 (all agents), AC #11 (model override)
- [ ] Commit: `feat: execPrompt streams agent output via docker exec for all 5 agents`

### Task 7: Container lifecycle — idle management cron
**Files:** `lib/containers/lifecycle.js`, `lib/cron.js`
**Complexity:** standard
**Dependencies:** Task 1, Task 4, Task 5
**Execution routing:** default implementation tier

- [ ] RED: Test `manageIdleContainers()`: workspace idle 31min → `pauseContainer` called + status='paused'. Idle 7h → `stopContainer` + status='stopped'. Idle 8d → `removeContainer` + status='none'. Test cron registration in `lib/cron.js`.
- [ ] GREEN: Implement `manageIdleContainers()` in lifecycle.js:
  - Query `getWorkspacesForIdleManagement()`
  - For each: calculate idle time from `lastMessageAt`
  - Transition: >7d→remove, >6h→stop, >30min→pause
  - Add `*/5 * * * *` cron call in `lib/cron.js`
- [ ] Verify: `npx vitest run lib/containers/lifecycle.test.mjs`
  Expected: idle transition tests pass with mocked time
- [ ] Acceptance: AC #8 (idle cron), AC #9 (unpause within 2s)
- [ ] Commit: `feat: idle container management cron — pause/stop/remove on timeout`

### Task 8: Refactor chatStream — persistent container path
**Files:** `lib/ai/index.js`
**Complexity:** complex
**Dependencies:** Task 5, Task 6
**Execution routing:** deep implementation tier

- [ ] RED: Test that `chatStream()` with workspace having container_status='ready' calls `execPrompt()` instead of LangGraph. Test warm-start: container_status='none' + LLM_PROVIDER set → yields cheap LLM text first, then waits for container ready. Test no LLM_PROVIDER → yields status event 'container-starting'.
- [ ] GREEN: Add condition in `chatStream()` after workspace resolution (before LangGraph):
  - Import `ensureContainer`, `execPrompt` from lifecycle.js
  - Call `ensureContainer(workspaceId)`
  - If not ready + LLM exists → stream cheap LLM response + `waitForContainerReady()`
  - If not ready + no LLM → yield status event + `waitForContainerReady()`
  - Once ready → `yield* execPrompt(containerName, agent, message, options)`
  - Update `lastMessageAt` after exec
  - Return before LangGraph agent code
- [ ] Verify: `npx vitest run lib/ai/index.test.mjs`
  Expected: persistent container path tests pass
- [ ] Acceptance: AC #1, #2, #3, #4 (full message flow)
- [ ] Commit: `feat: chatStream routes to persistent container with warm-start fallback`

### Task 9: Chat API — pass container context to frontend
**Files:** `lib/chat/api.js`
**Complexity:** standard
**Dependencies:** Task 8
**Execution routing:** default implementation tier

- [ ] RED: Test that `/stream/chat` handler passes `persistentContainer: true` and container status to `chatStream()`. Test new status chunk type ('container-starting') is forwarded to client.
- [ ] GREEN: Modify POST handler in `api.js`:
  - Extract container context from workspace
  - Pass to chatStream options
  - Handle new chunk type `{type:'status'}` — write as status event to UI stream
- [ ] Verify: `npx vitest run lib/chat/api.test.mjs`
  Expected: status event forwarding test passes
- [ ] Acceptance: AC #2 (status within 200ms)
- [ ] Commit: `feat: forward container status events through chat stream API`

### Task 10: Project sidebar component
**Files:** `lib/chat/components/project-sidebar.jsx` (NEW), `lib/chat/components/app-sidebar.jsx`
**Complexity:** complex
**Dependencies:** Task 3
**Execution routing:** deep implementation tier

- [ ] RED: Test ProjectSidebar renders project folders with collapsible threads. Test green dot for container_status='ready'. Test "See all (N)" when >3 threads. Test Archive action.
- [ ] GREEN: Create `project-sidebar.jsx`:
  - Fetch projects from `/projects/list` endpoint
  - Render collapsible folders (ChevronDown icon + folder name)
  - Show top 3 threads per project, "See all (N)" expander
  - Green dot indicator based on container_status
  - Right-click → Archive thread
  - Mount in `app-sidebar.jsx` replacing `SidebarHistory`
- [ ] Verify: `npm run build` (JSX → JS compilation)
  Expected: build succeeds, no compile errors
- [ ] Acceptance: AC #7 (project folders, no Agent/Code tabs)
- [ ] Commit: `feat: project-based sidebar replacing Agent/Code mode tabs`

### Task 11: Projects list API endpoint
**Files:** `lib/chat/api.js`, `web/app/projects/list/route.js` (NEW)
**Complexity:** standard
**Dependencies:** Task 3, Task 10
**Execution routing:** default implementation tier

- [ ] RED: Test GET `/projects/list` returns user's projects with recent threads and container status. Test auth required.
- [ ] GREEN: Add `getProjectsListHandler` in `api.js`:
  - Auth check via `auth()`
  - Call `getProjectsByUser(userId)`
  - Enrich each project with top 3 chats + totalChats count + container_status
  - Create route file `web/app/projects/list/route.js` re-exporting handler
- [ ] Verify: `npx vitest run lib/chat/api.test.mjs`
  Expected: projects list endpoint test passes
- [ ] Acceptance: AC #7 (sidebar data)
- [ ] Commit: `feat: /projects/list API endpoint with thread counts`

### Task 12: Terminal panel component
**Files:** `lib/chat/components/terminal-panel.jsx` (NEW), `lib/chat/components/chat.jsx`
**Complexity:** complex
**Dependencies:** Task 5
**Execution routing:** deep implementation tier

- [ ] RED: Test TerminalPanel renders collapsed bar "▸ Terminal". Test click expands to half-screen. Test fullscreen toggle + ESC to exit. Test WebSocket connects to container ttyd when expanded.
- [ ] GREEN: Create `terminal-panel.jsx`:
  - Three states: collapsed (thin bar), expanded (draggable divider), fullscreen
  - Reuse existing `TerminalView` component for xterm.js
  - WebSocket to `ws://.../code/${workspaceId}/ws` (existing proxy)
  - Draggable divider via onMouseDown + document mousemove
  - ESC handler for fullscreen exit
  - Mount at bottom of Chat component in `chat.jsx`
- [ ] Verify: `npm run build`
  Expected: build succeeds
- [ ] Acceptance: AC #5 (terminal connects), AC #6 (collapse/expand/fullscreen)
- [ ] Commit: `feat: inline terminal panel with collapse/expand/fullscreen modes`

### Task 13: Git actions toolbar
**Files:** `lib/chat/components/git-toolbar.jsx` (NEW), `lib/chat/components/chat-input.jsx`
**Complexity:** complex
**Dependencies:** Task 1, Task 6
**Execution routing:** deep implementation tier

- [ ] RED: Test GitToolbar renders Commit button with diff stats. Test clicking Commit calls `/chat/git-action` with action='commit'. Test Push and Create PR actions.
- [ ] GREEN: Create `git-toolbar.jsx`:
  - Fetch diff stats from existing `/code/workspace-diff/{id}` endpoint
  - Dropdown menu: Commit, Push, Create PR, Create branch
  - Each action POSTs to `/chat/git-action` with workspaceId + action
  - Show +N/-N diff count badge
  - Mount in `chat-input.jsx` replacing Interactive toggle
- [ ] Verify: `npm run build`
  Expected: build succeeds
- [ ] Acceptance: AC #12 (git actions from toolbar)
- [ ] Commit: `feat: git actions toolbar with commit/push/PR buttons`

### Task 14: Git action server endpoint
**Files:** `lib/chat/api.js`, `web/app/chat/git-action/route.js` (NEW)
**Complexity:** complex
**Dependencies:** Task 1
**Execution routing:** deep implementation tier

- [ ] RED: Test POST `/chat/git-action` with action='commit' executes `git add -A && git commit` in container. Test 'push' executes `git push`. Test 'create-pr' executes `gh pr create`. Test auth + workspace ownership check.
- [ ] GREEN: Add `postGitActionHandler` in `api.js`:
  - Auth + ownership validation
  - Build git command per action type
  - Call `execStreamInContainer(containerName, cmd)`
  - Collect output, return JSON result
  - Create route file `web/app/chat/git-action/route.js`
- [ ] Verify: `npx vitest run lib/chat/api.test.mjs`
  Expected: git action tests pass
- [ ] Acceptance: AC #12 (git actions execute via docker exec)
- [ ] Commit: `feat: /chat/git-action endpoint for commit/push/PR via container`

### Task 15: Remove Agent/Code mode split from UI
**Files:** `lib/chat/components/chat-input.jsx`, `lib/chat/components/code-mode-toggle.jsx`, `lib/chat/components/chat.jsx`
**Complexity:** complex
**Dependencies:** Task 10
**Execution routing:** deep implementation tier

- [ ] RED: Test that Agent/Code toggle is not rendered. Test that plan/code submode selector IS still rendered. Test that Job mode is not available. Test that new chat creation auto-creates project from selected repo.
- [ ] GREEN:
  - In `code-mode-toggle.jsx`: remove Agent↔Code radio toggle, keep plan/code dropdown
  - In `chat-input.jsx`: remove `codeModeSettings` for Agent/Code switch, remove Interactive toggle
  - In `chat.jsx`: remove `codeMode` state, always use persistent container path
  - Auto-create project via `ensureProject()` when user selects repo for new chat
- [ ] Verify: `npm run build`
  Expected: build succeeds, no Agent/Code toggle visible
- [ ] Acceptance: AC #7 (no Agent/Code tabs)
- [ ] Commit: `refactor: remove Agent/Code mode split — unified chat with project scope`

### Task 16: Chat archive functionality
**Files:** `lib/chat/actions.js`, `lib/db/chats.js`
**Complexity:** standard
**Dependencies:** Task 10
**Execution routing:** default implementation tier

- [ ] RED: Test `archiveChat(chatId)` sets archived flag in DB. Test `getChatsByProject(projectId)` excludes archived. Test `getArchivedChats(userId)` returns only archived.
- [ ] GREEN:
  - Add `archived` column to chats table (if not already in schema)
  - Add `archiveChat(chatId)` function
  - Modify chat listing to exclude archived by default
  - Add `getArchivedChats(userId)` for archive view
  - Add server action `archiveChatAction()` in actions.js
- [ ] Verify: `npx vitest run lib/db/chats.test.mjs`
  Expected: archive tests pass
- [ ] Acceptance: AC #13 (archive action)
- [ ] Commit: `feat: chat archive — recoverable alternative to delete`

### Task 17: Startup container audit
**Files:** `lib/containers/lifecycle.js`, `config/instrumentation.js`
**Complexity:** standard
**Dependencies:** Task 4, Task 5
**Execution routing:** default implementation tier

- [ ] RED: Test `auditContainersOnStartup()` finds workspaces with container_status='ready' but no Docker container → sets status to 'none'. Test workspaces with paused container in Docker → keeps status='paused'.
- [ ] GREEN: Implement `auditContainersOnStartup()` in lifecycle.js:
  - Query all workspaces where containerStatus != 'none'
  - For each: `inspectContainer(containerName)`
  - If Docker says running → keep 'ready'
  - If Docker says paused → set 'paused'
  - If Docker says stopped/exited → set 'stopped'
  - If container missing → set 'none'
  - Call from server startup in `config/instrumentation.js`
- [ ] Verify: `npx vitest run lib/containers/lifecycle.test.mjs`
  Expected: audit tests pass
- [ ] Acceptance: AC #14 (crash recovery on restart)
- [ ] Commit: `feat: audit container status on server startup`

### Task 18: JSX compilation + integration test
**Files:** all modified .jsx files
**Complexity:** complex
**Dependencies:** Task 10, 12, 13, 15
**Execution routing:** deep implementation tier

- [ ] RED: Run `npm run build` — verify all new JSX files compile to JS. Run full test suite.
- [ ] GREEN:
  - Add new .jsx files to esbuild config if not auto-detected
  - `npm run build` → compile .jsx → .js
  - `git add -f` the compiled .js files (gitignored by default)
  - Run `npx vitest run` for full suite
  - Manual smoke test: start dev server, open chat, verify sidebar shows projects
- [ ] Verify: `npm run build && npx vitest run`
  Expected: build succeeds, all tests pass
- [ ] Acceptance: All ACs verified in integration
- [ ] Commit: `build: compile JSX for persistent containers UI components`
