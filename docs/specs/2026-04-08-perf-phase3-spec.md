# Remaining Performance Optimizations -- Design Specification

> **spec_id:** 2026-04-08-perf-phase3-1430
> **topic:** Deferred performance optimizations from audit (render_md async, message virtualization, image CLS)
> **status:** Approved
> **created_at:** 2026-04-08T14:30:00Z
> **approved_at:** 2026-04-08T15:10:00Z
> **approval_mode:** interactive
> **author:** zuvo:brainstorm

## Problem Statement

The 2026-04-08 performance audit identified three deferred items requiring deeper architecture changes:

1. **`render_md()` blocks the event loop** — called on every chat message via `readFileSync` + recursive includes + sync `readdirSync` for skill descriptions. Every agent turn triggers full filesystem I/O synchronously.
2. **Chat message list has no virtualization** — all messages render to DOM unconditionally. Long conversations (100+ messages with tool calls, code blocks) degrade FPS. Even with `React.memo` on `PreviewMessage`, the DOM node count grows without bound.
3. **Image attachments cause CLS** — `<img>` tags have no explicit dimensions; images shift layout when they decode.

If we do nothing: server-side event loop stalls continue on every chat message; browser performance degrades linearly with conversation length; CLS score remains poor for image-heavy chats.

## Design Decisions

### DD1: Virtualization library -- `react-virtuoso`

**Chosen:** `react-virtuoso` (v4.18.4, MIT)
**Over:** `@tanstack/react-virtual`, `react-window`

Rationale: `react-virtuoso` has built-in `followOutput` for chat auto-scroll, handles variable-height items natively (no `estimateSize`/`measureElement` callbacks), and is the only library where chat is a first-class use case. TanStack Virtual has documented issues with dynamic-height + scroll-to-bottom (issue #1093). react-window requires fixed heights.

**Known trade-off:** Ctrl+F browser search will not find text in off-screen (unmounted) messages. This is an inherent limitation of DOM virtualization. Mitigation: `increaseViewportBy={{ top: 2000, bottom: 2000 }}` renders ~10-25 extra messages above/below viewport (pixel-based, not item-count). Note: `react-virtuoso`'s `overscan` prop is in pixels, not items.

### DD2: Streaming message placement -- outside virtualizer

**Chosen:** Render the last message (when `status === 'streaming'`) as a normal DOM element below the virtualizer.
**Over:** Virtualizing all messages including the streaming one.

Rationale: The streaming message changes height every ~50ms as tokens arrive. Virtualizers that measure and cache heights would cause scroll jitter. Keeping it outside avoids this entirely. When streaming ends, the message moves into the virtualized list on the next render cycle.

### DD3: `render_md()` caching -- mtime-based

**Chosen:** Cache file content in a module-level `Map` keyed by absolute path. Before using cache, `stat()` the file to check `mtimeMs`. If changed, re-read. Variable substitution (`{{datetime}}`, `{{skills}}`) applied AFTER cache lookup (never cached).
**Over:** No cache, TTL-based cache.

Rationale: mtime check is ~0.1ms (one syscall) vs ~1-5ms for a full read+parse. Template files rarely change in production (only when user edits config). The `{{datetime}}` variable stays fresh because it's resolved outside the cache.

### DD4: Image dimensions -- extract at upload time

**Chosen:** Use `createImageBitmap(file)` in `chat-input.jsx` when the user attaches an image. Store `{ width, height }` on the file part. Render with `style={{ aspectRatio }}`.
**Over:** `next/image` (not applicable for data URLs), `onLoad` handler (still causes first-paint CLS).

### DD5: LangGraph async prompt compatibility -- confirmed

**Confirmed:** `createReactAgent`'s `prompt` option wraps the function in `RunnableLambda.from(prompt)` (see `@langchain/langgraph/dist/prebuilt/react_agent_executor.js` line 28). `RunnableLambda._invoke` calls `await this.func(input, ...)` (base.js line 1257), so async functions are fully supported. The `prompt:` callback CAN be `async` — LangGraph already awaits it. No structural change needed beyond adding `async` and `await`.

## Solution Overview

Three independent changes that can be implemented and tested separately:

```
                     Server                          Client
                  ============                    ============
  render_md()     async + cache     messages.jsx   react-virtuoso
  render-md.js    fs.promises       messages.jsx   Virtuoso component
  agent.js        await in prompt   message.jsx    lazy img + aspect-ratio
  index.js        await call        chat-input.jsx createImageBitmap
                                    chat.jsx       width/height in fileParts
```

## Detailed Design

### A. Async `render_md()` with mtime cache

#### Files modified:
- `lib/utils/render-md.js` — full rewrite of `render_md`, `loadSkillDescriptions`, `resolveVariables`
- `lib/ai/agent.js` — add `async` to prompt functions, add `await`, import+call `clearRenderCache` in `resetAgentChats`
- `lib/ai/index.js` — add `await` to line 413

#### Data Model:
Module-level cache in `render-md.js`:
```js
const cache = new Map(); // key: absolutePath, value: { mtimeMs, content }
let skillDescCache = null; // cached skill descriptions string
```

#### API Surface:
```js
// Before (sync):
function render_md(filePath, chain = []) → string

// After (async):
async function render_md(filePath, chain = []) → Promise<string>

// New: cache invalidation (called by resetAgentChats)
export function clearRenderCache() → void  // clears cache Map + skillDescCache
```

#### Algorithm:
1. `resolve(filePath)` → absolute path
2. Check circular includes via `chain` array (unchanged)
3. Try `fs.promises.stat(path)` → get `mtimeMs`. If stat throws ENOENT, return `''` (same as current `existsSync` guard behavior). This replaces both `fs.existsSync` calls (line 84 for main file, line 93 for included files).
4. If cache has entry AND `mtimeMs` matches → use cached content
5. Else → `await fs.promises.readFile(path, 'utf8')` → store in cache with `mtimeMs`
6. Scan content for `{{file.md}}` includes using `matchAll(INCLUDE_PATTERN)`. Cannot use `content.replace()` with async callback — must collect all matches first.
7. For each match (sequential loop, for circular detection): `await render_md(includePath, [...chain, path])` → build replacement map
8. Apply all replacements to content string
9. `await resolveVariables(result)` (also async now, calls async `loadSkillDescriptions`)
10. Return final string

#### `loadSkillDescriptions()` async conversion:
- `fs.existsSync(activeDir)` → `try { await fs.promises.access(activeDir) } catch { return '' }`
- `fs.readdirSync` → `await fs.promises.readdir(dir, { withFileTypes: true })`
- `fs.existsSync(skillMdPath)` + `fs.readFileSync` per skill → `try { await fs.promises.readFile(...) } catch { continue }`
- Cache result in `skillDescCache`; cleared by `clearRenderCache()`

#### Caller changes:
```js
// lib/ai/agent.js line 31:
prompt: async (state) => [new SystemMessage(await render_md(...)), ...state.messages]

// lib/ai/agent.js line 53:
prompt: async (state) => [new SystemMessage(await render_md(...)), ...state.messages]

// lib/ai/index.js line 413:
const systemPrompt = await render_md(summaryMdPath);
```

#### `resetAgentChats()` integration (`lib/ai/agent.js`):
```js
import { clearRenderCache } from '../utils/render-md.js';

export function resetAgentChats() {
  globalThis.__popebotAgentChat = null;
  globalThis.__popebotCodeChat = null;
  clearRenderCache();
}
```

### B. Message list virtualization with `react-virtuoso`

#### Files modified:
- `lib/chat/components/messages.jsx` — replace scroll container with `Virtuoso`
- `package.json` — add `react-virtuoso` dependency

#### Component architecture:
```jsx
import { Virtuoso } from 'react-virtuoso';

export function Messages({ messages, status, onRetry, onEdit }) {
  const virtuosoRef = useRef(null);
  const endRef = useRef(null);
  const [atBottom, setAtBottom] = useState(true);

  const isStreaming = status === 'streaming';
  const lastMessage = messages.at(-1);

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
  };

  return (
    <div className="relative flex-1">
      <div className="absolute inset-0">
        {messages.length === 0 && <Greeting />}

        {messages.length > 0 && (
          <Virtuoso
            ref={virtuosoRef}
            data={isStreaming ? messages.slice(0, -1) : messages}
            itemContent={(index, message) => (
              <div className="mx-auto max-w-4xl px-4 md:px-6 py-2 md:py-3">
                <PreviewMessage
                  message={message}
                  isLoading={false}
                  onRetry={onRetry}
                  onEdit={onEdit}
                />
              </div>
            )}
            followOutput="smooth"
            increaseViewportBy={{ top: 2000, bottom: 2000 }}
            atBottomStateChange={setAtBottom}
            components={{
              Footer: () => (
                <div className="mx-auto max-w-4xl px-4 md:px-6 py-2 md:py-3">
                  {isStreaming && lastMessage && (
                    <PreviewMessage
                      message={lastMessage}
                      isLoading={true}
                      onRetry={onRetry}
                      onEdit={onEdit}
                    />
                  )}
                  {status === 'submitted' && <ThinkingMessage />}
                  <div className="min-h-[24px] shrink-0" ref={endRef} />
                </div>
              ),
            }}
          />
        )}

        {!atBottom && (
          <button
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-background p-2 shadow-lg hover:bg-muted"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
```

#### Scroll behavior:
- `followOutput="smooth"` — auto-scrolls when new content arrives AND user is at bottom
- `atBottomStateChange={setAtBottom}` — replaces manual scroll listener for `isAtBottom` state
- Scroll-to-bottom button uses existing inline `<button>` markup with `ArrowDown` icon (no new component)
- `scrollToBottom` calls `virtuosoRef.current.scrollToIndex({ index: 'LAST', behavior: 'smooth' })`
- Remove manual `useEffect` auto-scroll and `handleScroll` listener (Virtuoso handles both)

#### Streaming message pattern:
- When `status === 'streaming'`: pass `messages.slice(0, -1)` to Virtuoso data, render `lastMessage` (`messages.at(-1)`) in `Footer`
- When streaming ends: full `messages` array goes to Virtuoso data, Footer has no message content
- `ThinkingMessage` always renders in Footer (outside virtualizer)

#### ToolCall expand/collapse:
`react-virtuoso` uses automatic height detection via the browser's layout engine — no explicit `measureElement` needed. When a ToolCall expands, the DOM element grows, Virtuoso detects the height change and adjusts. No additional code required.

### C. Image CLS prevention

#### Files modified:
- `lib/chat/components/chat-input.jsx` — extract dimensions at upload time
- `lib/chat/components/chat.jsx` — pass `width`/`height` through to file parts
- `lib/chat/components/message.jsx` — add `loading="lazy"` + `aspect-ratio` style

#### Dimension extraction (`chat-input.jsx`):

The current `handleFiles` function (lines 97-112) uses `FileReader.onload` (callback-based). Since `createImageBitmap` is Promise-based, the file processing loop must be restructured:

```js
// Current pattern (simplified):
// reader.onload = () => { setFiles(prev => [...prev, { file, previewUrl: reader.result }]); };
// reader.readAsDataURL(file);

// New pattern — wrap FileReader in a Promise, chain with createImageBitmap:
async function processFile(file) {
  const previewUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  let width, height;
  if (file.type.startsWith('image/')) {
    try {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
    } catch { /* non-image or corrupt — leave undefined */ }
  }

  return { file, previewUrl, width, height };
}

// In handleFiles:
const processed = await Promise.all(acceptedFiles.map(processFile));
setFiles(prev => [...prev, ...processed]);
```

#### File part shape (`chat.jsx` `handleSend`, line ~151-156):
```js
// Before:
const fileParts = currentFiles.map((f) => ({
  type: 'file',
  mediaType: f.file.type || 'text/plain',
  url: f.previewUrl,
  filename: f.file.name,
}));

// After — pass through width/height if present:
const fileParts = currentFiles.map((f) => ({
  type: 'file',
  mediaType: f.file.type || 'text/plain',
  url: f.previewUrl,
  filename: f.file.name,
  ...(f.width && { width: f.width, height: f.height }),
}));
```

#### Render (`message.jsx`):
Both `<img>` tags (user messages line ~401, AI messages line ~440) change to:
```jsx
<img
  src={part.url}
  alt="attachment"
  loading={isLoading ? 'eager' : 'lazy'}
  className="max-h-64 max-w-full rounded-lg object-contain"
  style={part.width ? { aspectRatio: `${part.width}/${part.height}` } : undefined}
/>
```

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Streaming message height changes every ~50ms | Rendered outside virtualizer in Footer |
| ToolCall expand/collapse changes height | Virtuoso auto-detects via browser layout |
| Ctrl+F search misses off-screen messages | Known trade-off; `increaseViewportBy: 2000px` renders ~10-25 extra messages |
| ThinkingMessage placement | Always in Footer, outside virtualizer |
| `onEdit` on off-screen message | User clicks edit on visible message, so always in viewport |
| `{{datetime}}` freshness after caching | Variable substitution applied AFTER cache lookup; never cached |
| User edits template .md file | mtime check detects change on next call; `resetAgentChats` also calls `clearRenderCache()` |
| Concurrent render_md calls on same file | Safe — reads are non-destructive; cache Map is synchronous access |
| Mobile touch scrolling with Virtuoso | Virtuoso uses native scroll container; `touch-pan-y` preserved |
| Images without stored dimensions (old messages) | Fallback: no `aspect-ratio` set, same as current behavior |
| Missing files in render_md | `stat()` throws ENOENT → return `''` (replaces `existsSync` guard) |
| `handleFiles` becomes async | Wrapped in `Promise.all` with async `processFile` helper |

## Acceptance Criteria

1. `render_md()` returns a Promise; all callers use `await`; no `readFileSync`/`readdirSync`/`existsSync` in the function
2. Chat messages render in a `react-virtuoso` Virtuoso component
3. Streaming messages render below the virtualizer with no scroll jitter
4. Auto-scroll to bottom works during streaming (when user is at bottom)
5. "Scroll to bottom" button appears when user scrolls up; clicking it scrolls to bottom
6. Editing template .md files takes effect on next chat message (mtime cache invalidation)
7. `clearRenderCache()` is exported from `lib/utils/render-md.js` and called by `resetAgentChats()` in `lib/ai/agent.js`
8. Image attachments have `loading="lazy"` and `aspect-ratio` style when dimensions are available
9. `npm run build` passes with no errors
10. Existing `React.memo` on `PreviewMessage` continues to work with Virtuoso

## Out of Scope

- In-app message search (to compensate for Ctrl+F limitation) — separate feature
- Server-side image storage (replacing data URLs with file paths) — separate architectural decision
- `use-stick-to-bottom` as scroll replacement — superseded by Virtuoso's built-in `followOutput`
- `next/image` integration — not applicable for data URLs
- Bundle analysis tooling — dev infrastructure, separate task

## Open Questions

None — all questions resolved during design dialogue.
