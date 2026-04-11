#!/usr/bin/env node
/**
 * SDK Server — persistent Claude Agent SDK session exposed via HTTP.
 *
 * Runs alongside tmux/ttyd in interactive containers. The event handler
 * sends prompts here instead of spawning `claude -p` per message, avoiding
 * the 5-8s plugin/init overhead on every call.
 *
 * Port: 7682 (ttyd uses 7681)
 * POST /prompt  { prompt, model? }  → NDJSON stream of SDK messages
 * GET  /health                      → 200 "ok"
 */

import http from 'node:http';
import { existsSync } from 'node:fs';

// ES module import needs absolute file path or package in local node_modules.
// Global install at /usr/lib/node_modules needs explicit file URL.
const SDK_URL = (() => {
  const globalPath = '/usr/lib/node_modules/@anthropic-ai/claude-agent-sdk';
  if (existsSync(`${globalPath}/package.json`)) {
    return `file://${globalPath}/sdk.mjs`;
  }
  return '@anthropic-ai/claude-agent-sdk';
})();

let sdk = null;
let currentModel = process.env.LLM_MODEL || 'claude-sonnet-4-6';
let busy = false;

async function loadSdk() {
  if (!sdk) {
    try {
      sdk = await import(SDK_URL);
    } catch (err) {
      // Fallback: try importing from exports
      console.error(`[sdk-server] Failed to import ${SDK_URL}:`, err.message);
      // Read package.json to find main entry
      const pkg = JSON.parse(
        await import('node:fs/promises').then(fs =>
          fs.readFile('/usr/lib/node_modules/@anthropic-ai/claude-agent-sdk/package.json', 'utf-8')
        )
      );
      const entry = pkg.exports?.['.']?.import || pkg.exports?.['.']?.default || pkg.main || 'sdk.mjs';
      const entryUrl = `file:///usr/lib/node_modules/@anthropic-ai/claude-agent-sdk/${entry.replace(/^\.\//, '')}`;
      console.log(`[sdk-server] Retry with ${entryUrl}`);
      sdk = await import(entryUrl);
    }
  }
  return sdk;
}

async function getSession(model) {
  const { query } = await loadSdk();

  // Model change → close old session
  if (model && model !== currentModel) {
    session = null;
    currentModel = model;
  }
  return { query, currentModel };
}

const server = http.createServer(async (req, res) => {
  // CORS for internal Docker network
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.method === 'POST' && req.url === '/prompt') {
    if (busy) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session busy — another prompt is in progress' }));
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    let prompt, model;
    try {
      ({ prompt, model } = JSON.parse(body));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!prompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing prompt' }));
      return;
    }

    busy = true;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });

    try {
      const { query, currentModel: activeModel } = await getSession(model);

      // Use V1 query() with continue:true for multi-turn
      const q = query({
        prompt,
        options: {
          model: activeModel,
          cwd: '/home/coding-agent/workspace',
          permissionMode: 'bypassPermissions',
          continue: true,
          maxTurns: 50,
        },
      });

      for await (const msg of q) {
        res.write(JSON.stringify(msg) + '\n');
      }
    } catch (err) {
      console.error('[sdk-server] prompt error:', err.message);
      res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
    } finally {
      busy = false;
      res.end();
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

const PORT = parseInt(process.env.SDK_PORT || '7682', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[sdk-server] listening on :${PORT} (model: ${currentModel})`);
});

// Graceful shutdown
process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });
