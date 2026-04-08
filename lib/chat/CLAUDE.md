# lib/chat/ — Chat System

## Files

| File | Purpose |
|------|---------|
| `api.js` | Route handlers for all browser-to-server fetch calls (chat streaming + data endpoints) |
| `actions.js` | Server actions for mutations (rename, delete, star, coding agent config, container management) |
| `utils.js` | `cn()` — Tailwind class merging via `clsx` + `twMerge` |
| `components/` | React UI components (see `components/CLAUDE.md` for standards) |

## Route Handler Architecture

`api.js` contains all handler implementations. Route files in `web/app/` are thin re-exports:

```js
// web/app/code/repositories/route.js
export { getRepositoriesHandler as GET } from 'thepopebot/chat/api';
```

**Streaming** (stays in `/stream/`):
- `POST /stream/chat` — AI SDK streaming via `createUIMessageStream`. Handles file attachments (images/PDFs as visual, text files inlined), workspace context, and code mode settings.

**Data fetch routes** (colocated with pages):
- `/code/repositories`, `/code/branches`, `/code/default-repo` — GitHub repo/branch listing
- `/code/workspace-branch` (POST) — update workspace branch
- `/code/workspace-diff/[workspaceId]` — diff stats
- `/code/workspace-diff/[workspaceId]/full` — full unified diff
- `/chats` — chat list with workspace join
- `/chats/counts` — notification + PR badge counts
- `/chat/[chatId]/data` — chat + workspace data
- `/chat/[chatId]/messages` — chat message history
- `/code/[workspaceId]/chat-data` — chat data by workspace
- `/chat/voice-token` — AssemblyAI temporary token
- `/admin/app-version` — version + update check
- `/chat/finalize-chat` (POST) — auto-title after first message

## Chat Streaming Flow

1. Client sends message via AI SDK `DefaultChatTransport` → `POST /stream/chat`
2. Handler validates session, extracts text + file attachments from message parts
3. Calls `chatStream()` from `lib/ai/` which handles DB persistence and LLM invocation
4. Streams response chunks (text deltas, tool calls, tool results) via `createUIMessageStream`
5. After first message, client calls `/chat/finalize-chat` to generate auto-title

## Server Actions (actions.js)

Used for mutations that don't need streaming responses. Key groups:

- **Chat CRUD**: `renameChat()`, `deleteChat()`, `starChat()`
- **Coding agents**: `getCodingAgentSettings()`, `updateCodingAgentConfig()`, `setCodingAgentDefault()`
- **Agent job secrets**: `getAgentJobSecrets()`, `updateAgentJobSecret()`, `deleteAgentJobSecretAction()`
- **Container management**: `getRunnersStatus()`, `stopDockerContainer()`, `startDockerContainer()`, `removeDockerContainer()`
