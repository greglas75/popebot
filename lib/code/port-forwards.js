/**
 * In-memory port forward registry and Traefik config writer.
 * Maps workspaceId → Map<port, { containerName, createdAt }>
 *
 * Persists to port-forwards.yml (read by Traefik) in TRAEFIK_CONFIG_DIR.
 * On first access, rehydrates from that file so forwards survive restarts.
 *
 * Uses globalThis to ensure a single shared instance across Next.js
 * server action bundles.
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const GLOBAL_KEY = '__portForwards';
const LOADED_KEY = '__portForwardsLoaded';
if (!globalThis[GLOBAL_KEY]) {
  globalThis[GLOBAL_KEY] = new Map();
}
const forwards = globalThis[GLOBAL_KEY];

/**
 * Rehydrate the in-memory map from port-forwards.yml on first access.
 * Router keys use full workspaceId: `wksp-{workspaceId}-{port}`
 * Service URLs: `http://{containerName}:{port}`
 */
function ensureLoaded() {
  if (globalThis[LOADED_KEY]) return;
  globalThis[LOADED_KEY] = true;

  const configDir = process.env.TRAEFIK_CONFIG_DIR;
  if (!configDir) return;

  const configPath = path.join(configDir, 'port-forwards.yml');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = YAML.parse(raw);
    if (!config?.http?.routers || !config?.http?.services) return;

    for (const [key, router] of Object.entries(config.http.routers)) {
      // key format: wksp-{workspaceId}-{port}
      const match = key.match(/^wksp-(.+)-(\d+)$/);
      if (!match) continue;

      const workspaceId = match[1];
      const port = parseInt(match[2], 10);

      const service = config.http.services[key];
      const url = service?.loadBalancer?.servers?.[0]?.url;
      if (!url) continue;

      // url format: http://{containerName}:{port}
      const urlMatch = url.match(/^http:\/\/(.+):(\d+)$/);
      if (!urlMatch) continue;

      const containerName = urlMatch[1];

      if (!forwards.has(workspaceId)) {
        forwards.set(workspaceId, new Map());
      }
      forwards.get(workspaceId).set(port, { containerName, createdAt: 0 });
    }
  } catch {
    // File doesn't exist or is invalid — start fresh
  }
}

export function addForward(workspaceId, port, data) {
  ensureLoaded();
  if (!forwards.has(workspaceId)) {
    forwards.set(workspaceId, new Map());
  }
  forwards.get(workspaceId).set(port, data);
  writeTraefikConfig();
}

export function removeForward(workspaceId, port) {
  ensureLoaded();
  const ws = forwards.get(workspaceId);
  if (ws) {
    ws.delete(port);
    if (ws.size === 0) forwards.delete(workspaceId);
  }
  writeTraefikConfig();
}

export function getForwards(workspaceId) {
  ensureLoaded();
  return forwards.get(workspaceId) || new Map();
}

export function clearWorkspaceForwards(workspaceId) {
  ensureLoaded();
  forwards.delete(workspaceId);
  writeTraefikConfig();
}

/**
 * Write Traefik dynamic config as YAML for all active port forwards.
 *
 * When SSL_DOMAIN is set (custom compose with Let's Encrypt), routes use
 * *.SSL_DOMAIN on the websecure entrypoint with the letsencrypt cert resolver.
 * Otherwise, routes use *.localhost on the web entrypoint (local dev).
 *
 * MUST be YAML, not JSON — Traefik's file provider treats backticks in
 * JSON as Go template delimiters, silently breaking Host() rules.
 *
 * Router/service keys use full workspaceId so we can rehydrate on restart.
 */
function writeTraefikConfig() {
  const configDir = process.env.TRAEFIK_CONFIG_DIR;
  if (!configDir) return;

  const configPath = path.join(configDir, 'port-forwards.yml');

  // Collect all forwards
  const entries = [];
  for (const [workspaceId, portMap] of forwards) {
    for (const [port, data] of portMap) {
      entries.push({ workspaceId, port, containerName: data.containerName });
    }
  }

  // No forwards — delete the file so Traefik drops all routes
  if (entries.length === 0) {
    try { fs.unlinkSync(configPath); } catch {}
    return;
  }

  const sslDomain = process.env.SSL_DOMAIN;
  const entrypoint = sslDomain ? 'websecure' : 'web';

  const lines = ['http:', '  routers:'];
  for (const { workspaceId, port } of entries) {
    const key = `wksp-${workspaceId}-${port}`;
    const subdomain = `${workspaceId.slice(0, 8)}-${port}`;
    const host = sslDomain ? `${subdomain}.${sslDomain}` : `${subdomain}.localhost`;
    lines.push(`    ${key}:`);
    lines.push('      rule: Host(`' + host + '`)');
    lines.push('      entryPoints:');
    lines.push(`        - ${entrypoint}`);
    if (sslDomain) {
      lines.push('      tls:');
      lines.push('        certResolver: letsencrypt');
      lines.push('        domains:');
      lines.push(`          - main: ${sslDomain}`);
      lines.push(`            sans: "*.${sslDomain}"`);
    }
    lines.push(`      service: ${key}`);
  }
  lines.push('  services:');
  for (const { workspaceId, port, containerName } of entries) {
    const key = `wksp-${workspaceId}-${port}`;
    lines.push(`    ${key}:`);
    lines.push('      loadBalancer:');
    lines.push('        servers:');
    lines.push(`          - url: http://${containerName}:${port}`);
  }

  try {
    fs.writeFileSync(configPath, lines.join('\n') + '\n');
  } catch (err) {
    console.error('[port-forwards] Failed to write Traefik config:', err.message);
  }
}
