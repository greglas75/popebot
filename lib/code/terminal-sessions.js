/**
 * In-memory terminal session registry.
 * Maps workspaceId → Map<sessionId, { port, pid, label, createdAt }>
 *
 * Uses globalThis to ensure a single shared instance across Next.js
 * server action bundles and the ws-proxy module.
 */

const GLOBAL_KEY = '__terminalSessions';
if (!globalThis[GLOBAL_KEY]) {
  globalThis[GLOBAL_KEY] = new Map();
}
const sessions = globalThis[GLOBAL_KEY];

const PORT_START = 7682;

export function addSession(workspaceId, sessionId, data) {
  if (!sessions.has(workspaceId)) {
    sessions.set(workspaceId, new Map());
  }
  sessions.get(workspaceId).set(sessionId, data);
}

export function getSession(workspaceId, sessionId) {
  return sessions.get(workspaceId)?.get(sessionId) || null;
}

export function getSessions(workspaceId) {
  return sessions.get(workspaceId) || new Map();
}

export function removeSession(workspaceId, sessionId) {
  const ws = sessions.get(workspaceId);
  if (ws) {
    ws.delete(sessionId);
    if (ws.size === 0) sessions.delete(workspaceId);
  }
}

export function getNextPort(workspaceId, extraPorts = null) {
  const ws = sessions.get(workspaceId);
  const usedPorts = new Set();
  if (ws) {
    for (const s of ws.values()) usedPorts.add(s.port);
  }
  if (extraPorts) {
    for (const p of extraPorts) usedPorts.add(p);
  }
  for (let port = PORT_START; port <= 65535; port++) {
    if (!usedPorts.has(port)) return port;
  }
  return null;
}

export function clearWorkspaceSessions(workspaceId) {
  sessions.delete(workspaceId);
}
