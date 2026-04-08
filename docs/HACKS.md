# Hacks & Workarounds

Things we had to hack around because upstream doesn't provide an official API. Check back on these when upgrading dependencies.

---

## `app.didWebSocketSetup = true` (Next.js)

**File:** `web/server.js`
**Affects:** Next.js 15.x (and likely 16 — no fix announced)
**Upstream issue:** [vercel/next.js#58698](https://github.com/vercel/next.js/discussions/58698)

### Problem

Next.js lazily registers its own WebSocket upgrade handler via an internal `setupWebSocketHandler()` method in `next/dist/server/next.js`. When it encounters an upgrade request it doesn't recognize, it uses its bundled `http-proxy` to write `HTTP/1.1 502 Bad Gateway` directly to the raw socket — even if we've already upgraded that socket to a working WebSocket connection.

This destroys our WebSocket proxy connections to ttyd containers.

### The hack

```javascript
const app = next({ dev: false });
app.didWebSocketSetup = true; // prevents setupWebSocketHandler() from running
```

Setting this undocumented boolean before `app.prepare()` tricks Next.js into thinking it already registered its upgrade handler, so it never installs the competing one.

### Risks

- **Undocumented internal** — Next.js can rename or remove this property at any time. A Next.js upgrade could silently break WebSocket proxying (symptom: 502 errors on `/code/*/ws` connections).
- **HMR in dev mode** — This disables Next.js's own WebSocket handler, including the one used for Hot Module Replacement. Since we only run this in production (`dev: false`), this isn't an issue, but don't use this server in development.

### How we found it

Debug-intercepted `socket.write()` calls during WebSocket upgrade showed Next.js writing HTTP 502 responses. Stack trace pointed to `next/dist/compiled/http-proxy/index.js`, called from `setupWebSocketHandler()`. Grepping the Next.js source revealed the `didWebSocketSetup` guard.

### When to remove

Remove this hack when Next.js provides an official API for custom WebSocket upgrade handling in custom servers (track [vercel/next.js#58698](https://github.com/vercel/next.js/discussions/58698)). Test by removing the line and confirming WebSocket connections to `/code/*/ws` still work without 502 errors.
