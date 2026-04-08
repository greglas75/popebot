# lib/containers/ — Container Streaming

`stream.js` exports `GET(request)` — an SSE route handler for real-time Docker container monitoring.

**Endpoint**: `/stream/containers` (actual SSE streaming, stays in `/stream/`)
**Auth**: `auth()` session check
**Events**: `containers` (every 3s with full container list + CPU/memory stats), `ping` (keepalive every 15s)
**Data source**: `listNetworkContainers()` + `getContainerStats()` from `lib/tools/docker.js`
**Client**: `ContainersPage` connects via `new EventSource('/stream/containers')`
