import { WebSocketServer, WebSocket } from 'ws';
import { decode } from 'next-auth/jwt';
import { getCodeWorkspaceById } from '../db/code-workspaces.js';
import { getSession } from './terminal-sessions.js';

async function isAuthenticated(req) {
  const cookies = req.headers.cookie || '';
  const secureName = '__Secure-authjs.session-token';
  const plainName = 'authjs.session-token';
  const isSecure = cookies.includes(secureName);
  const name = isSecure ? secureName : plainName;
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`));
  if (!match) return null;

  try {
    const token = await decode({
      token: match[1],
      secret: process.env.AUTH_SECRET,
      salt: name,
    });
    return token?.sub || null;
  } catch {
    return null;
  }
}

function proxyWebSocket(wss, req, socket, head, container, port) {
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    const backendWs = new WebSocket(`ws://${container}:${port}/ws`, 'tty');

    backendWs.on('open', () => {
      console.log(`[ws-proxy] connected: ${container}:${port}`);
    });

    backendWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    clientWs.on('message', (data, isBinary) => {
      if (backendWs.readyState === WebSocket.OPEN) {
        backendWs.send(data, { binary: isBinary });
      }
    });

    backendWs.on('error', (err) => {
      console.error(`[ws-proxy] backend error: ${err.message}`);
      clientWs.close();
    });

    backendWs.on('close', () => clientWs.close());
    clientWs.on('error', () => backendWs.close());
    clientWs.on('close', () => backendWs.close());
  });
}

export function attachCodeProxy(server) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  server.on('upgrade', async (req, socket, head) => {
    // Match Claude Code terminal: /code/{id}/ws
    const mainMatch = req.url.match(/^\/code\/([^/]+)\/ws$/);
    // Match shell terminal: /code/{id}/term/{sessionId}/ws
    const termMatch = !mainMatch && req.url.match(/^\/code\/([^/]+)\/term\/([^/]+)\/ws$/);

    if (!mainMatch && !termMatch) return;

    const userId = await isAuthenticated(req);
    if (!userId) {
      console.log('[ws-proxy] rejected: unauthenticated upgrade');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const codeWorkspaceId = (mainMatch || termMatch)[1];
    const codeWorkspace = getCodeWorkspaceById(codeWorkspaceId);
    if (!codeWorkspace) {
      console.log(`[ws-proxy] rejected: unknown workspace ${codeWorkspaceId}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    if (codeWorkspace.userId !== userId) {
      console.log(`[ws-proxy] rejected: user ${userId} does not own workspace ${codeWorkspaceId}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const container = codeWorkspace.containerName;

    if (mainMatch) {
      proxyWebSocket(wss, req, socket, head, container, 7681);
    } else {
      const sessionId = termMatch[2];
      const session = getSession(codeWorkspaceId, sessionId);
      if (!session) {
        console.log(`[ws-proxy] rejected: unknown session ${sessionId}`);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
      proxyWebSocket(wss, req, socket, head, container, session.port);
    }
  });
}
