# lib/ai/ — LLM Integration

## Agent Types

Two agent singletons, both using `createReactAgent` from `@langchain/langgraph/prebuilt` with `SqliteSaver` for conversation memory:

**Agent Chat** — singleton via `getAgentChat()`:
- System prompt: `event-handler/agent-chat/SYSTEM.md` (rendered fresh each invocation via `render_md()`)
- Tools: `agent_job`, `coding_agent`
- Call `resetAgentChats()` to clear both singletons (required if hot-reloading)

**Code Chat** — singleton via `getCodeChat()`:
- System prompt: `event-handler/code-chat/SYSTEM.md` (rendered fresh each invocation)
- Tools: `coding_agent` (reads repo/branch/workspace from `runtime.configurable`)

## Adding a New Tool

1. Define in `tools.js` with Zod schema (use `tool()` from `@langchain/core/tools`)
2. Add to the agent's tools array in `agent.js`
3. Call `resetAgentChats()` if the agent needs to pick up the new tool without restart

## Chat Modes

Two primary chat modes stored in `chats.chatMode`:

**Agent mode** (`chatMode: 'agent'`) — Tools: `agent_job`, `coding_agent`. Three sub-modes selected per-chat via `codeModeType` (stored in client localStorage):
- **plan** — `coding_agent` runs in read-only permission mode
- **code** — `coding_agent` runs in write (dangerous) permission mode
- **job** — `agent_job` dispatches autonomous Docker container task

**Code mode** (`chatMode: 'code'`) — Tool: `coding_agent` only (operates on user's selected repo). Sub-modes: plan and code (no job).

The `[chat mode: X]` suffix is appended to user messages in `index.js` so the LLM knows which tool to invoke. `codeModeType` flows through `runtime.configurable` to tools, which map it to Docker's `PERMISSION` env var (`plan` or `code`).

## Model Resolution

`createModel()` in `model.js` resolves provider/model at agent creation time (singleton for chat agent). Provider determined by `LLM_PROVIDER` config, model by `LLM_MODEL`. Changing these requires restart (or `resetAgentChats()`).

### LLM Providers

Source of truth: `lib/llm-providers.js` (`BUILTIN_PROVIDERS`). Each provider declares credentials, available models, and capability flags (`chat`, `codingAgent`) that gate which models appear in which UI contexts.

| Provider | `LLM_PROVIDER` | Default Model | Required Key |
|----------|----------------|---------------|-------------|
| Anthropic | `anthropic` (default) | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `gpt-5.4` | `OPENAI_API_KEY` |
| Google | `google` | `gemini-2.5-flash` | `GOOGLE_API_KEY` |
| DeepSeek | `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| MiniMax | `minimax` | `MiniMax-M2.7` | `MINIMAX_API_KEY` |
| Mistral | `mistral` | `mistral-large-latest` | `MISTRAL_API_KEY` |
| xAI | `xai` | `grok-4.20-0309-non-reasoning` | `XAI_API_KEY` |
| Kimi | `kimi` | `kimi-k2.5` | `MOONSHOT_API_KEY` |
| OpenRouter | `openrouter` | (user-specified) | `OPENROUTER_API_KEY` |

All credentials are stored in the settings DB (encrypted), not `.env`. Configured via `/admin/event-handler/llms` (credentials) and `/admin/event-handler/chat` (model selection).

**Custom providers**: Users can add OpenAI-compatible providers via the admin UI. Stored as `type: 'llm_provider'` in the settings table. Resolved in `model.js` via `getCustomProvider()`.

`LLM_MAX_TOKENS` defaults to 4096.

> **Google model compatibility note:** `gemini-2.5-pro` and `gemini-3.*` models require `thought_signature` round-tripping that `@langchain/google-genai` doesn't support. Auto-falls back to `gemini-2.5-flash` with a warning (issue #201).

## Chat Streaming

`chatStream()` in `index.js` yields chunks: `{ type: 'text', content }`, `{ type: 'tool-call', name, args }`, `{ type: 'tool-result', name, result }`. Called by `lib/chat/api.js` (the `/stream/chat` endpoint).

## Headless Stream Parser (headless-stream.js)

Three-layer parser for Claude Code agents running in headless Docker containers:

1. **Docker frame decoder** — Parses 8-byte multiplexed stream headers (type + size), extracts stdout frames, discards stderr. Buffers incomplete frames across chunks.
2. **NDJSON splitter** — Accumulates decoded UTF-8, splits on newlines. Holds incomplete trailing lines for next chunk.
3. **Event mapper** (`mapLine()`) — Converts each line to chat events:
   - `assistant` messages: `text` blocks → `{ type: 'text' }`, `tool_use` blocks → `{ type: 'tool-call' }`
   - `user` messages: `tool_result` blocks → `{ type: 'tool-result' }` (priority: stdout > string content > array)
   - `result` messages: → `{ type: 'text' }` (final summary from the agent)
   - Non-JSON lines (e.g. `NO_CHANGES`, `AGENT_FAILED`): wrapped as plain text events

`parseHeadlessStream(dockerLogStream)` is an async generator consuming `http.IncomingMessage`. `mapLine()` is also reused by `lib/cluster/stream.js` for worker log parsing.

### Tool Return Format

The `coding_agent` tool (in `tools.js`) returns the **full container session** as a flat JSON array. This becomes the ToolMessage in LangGraph's checkpoint, giving the LLM complete context on the current turn. The array contains:

- `{ type: 'meta', codingAgent, backendApi }` — first event, agent identity
- `{ type: 'text', text }` — agent text output
- `{ type: 'tool-call', toolCallId, toolName, args }` — agent tool invocations
- `{ type: 'tool-result', toolCallId, result }` — tool execution results
- `{ type: 'exit', exitCode }` — last event, container exit status

On error before streaming starts: `[{ type: 'error', message }]`.

### Adding a New Agent Mapper (line-mappers.js)

Each coding agent CLI has its own mapper function (`mapClaudeCodeLine`, `mapPiLine`, `mapGeminiLine`, `mapCodexLine`, `mapOpenCodeLine`, `mapKimiLine`). When adding a new agent:

1. Create `mapXxxLine(parsed)` in `line-mappers.js` that returns an array of `{ type, ... }` events
2. Register it in `headless-stream.js`: add to imports, re-exports, and the `mapperMap` object
3. Map the agent's JSON output to three event types: `{ type: 'text', text }`, `{ type: 'tool-call', toolCallId, toolName, args }`, `{ type: 'tool-result', toolCallId, result }`
4. Return `[{ type: 'skip' }]` for noise events (session init, rate limits, etc.) to suppress them without triggering the unknown fallback
