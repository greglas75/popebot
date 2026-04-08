import cron from 'node-cron';
import { getAllRolesWithTriggers, getRoleWithCluster } from '../db/clusters.js';
import { acquireAndRunRole } from './execute.js';
import path from 'path';

// ── In-memory state ──────────────────────────────────────────────
let _cronTasks = [];      // [{ roleId, task }]
let _fileWatchers = [];   // [{ roleId, watcher }]

// ── Boot & Reload ────────────────────────────────────────────────

/**
 * Start the cluster runtime — schedule crons and file watchers.
 * Called once at boot from instrumentation.js.
 */
export function startClusterRuntime() {
  try {
    loadRoles();
    console.log('[cluster] Runtime started');
  } catch (err) {
    console.error('[cluster] Failed to start runtime:', err.message);
  }
}

/**
 * Stop all crons, close file watchers, and re-load from DB.
 * Called when roles/triggers are updated via UI.
 */
export function reloadClusterRuntime() {
  for (const { task } of _cronTasks) {
    task.stop();
  }
  _cronTasks = [];

  for (const { watcher } of _fileWatchers) {
    watcher.close();
  }
  _fileWatchers = [];

  try {
    loadRoles();
    console.log('[cluster] Runtime reloaded');
  } catch (err) {
    console.error('[cluster] Failed to reload runtime:', err.message);
  }
}

/**
 * Load all roles with trigger configs from DB and set up crons/file watchers.
 * Webhooks are always-on — no registration needed.
 */
function loadRoles() {
  const roles = getAllRolesWithTriggers();
  let cronCount = 0;
  let fileWatchCount = 0;

  for (const role of roles) {
    const config = role.triggerConfig;
    if (!config) continue;

    // Cron trigger — direct execution
    if (config.cron && config.cron.enabled && config.cron.schedule) {
      const schedule = config.cron.schedule;
      if (!cron.validate(schedule)) {
        console.warn(`[cluster] Invalid cron schedule for role ${role.id}: ${schedule}`);
        continue;
      }
      const task = cron.schedule(schedule, async () => {
        try {
          const result = await acquireAndRunRole(role.id, null, { type: 'cron', schedule });
          if (!result.allowed) return;
        } catch (err) {
          console.error(`[cluster] Cron execution failed for role ${role.id}:`, err.message);
        }
      });
      _cronTasks.push({ roleId: role.id, task });
      cronCount++;
    }

    // File watch trigger — direct execution
    if (config.file_watch && config.file_watch.enabled && config.file_watch.paths) {
      setupFileWatch(role);
      fileWatchCount++;
    }
  }

  if (cronCount > 0 || fileWatchCount > 0) {
    console.log(`[cluster] Loaded ${cronCount} cron(s), ${fileWatchCount} file watcher(s)`);
  }
}

/**
 * Set up a chokidar file watcher for a role.
 */
async function setupFileWatch(role) {
  let chokidar;
  try {
    chokidar = await import('chokidar');
  } catch {
    console.warn(`[cluster] chokidar not installed, skipping file watch for role ${role.id}`);
    return;
  }

  const roleData = getRoleWithCluster(role.id);
  if (!roleData?.cluster) return;

  const { clusterNaming } = await import('./execute.js');
  const { dataDir } = clusterNaming(roleData.cluster);

  const paths = role.triggerConfig.file_watch.paths
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.join(dataDir, p));

  if (paths.length === 0) return;

  const debounce = Math.max(100, parseInt(role.triggerConfig.file_watch.debounce) || 1000);
  const debounceMs = debounce;
  let debounceTimer = null;
  const changedFiles = new Set();
  const watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
    ignored: /\/logs\//,
  });

  watcher.on('add', (filePath) => debouncedTrigger(filePath));
  watcher.on('change', (filePath) => debouncedTrigger(filePath));

  function debouncedTrigger(filePath) {
    if (filePath) {
      if (changedFiles.size >= 1000) {
        console.warn(`[cluster] File watcher for role ${role.id} changedFiles set exceeded 1000 entries — dropping new entries`);
      } else {
        const relative = path.relative(dataDir, filePath);
        changedFiles.add(relative);
      }
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      const files = [...changedFiles];
      changedFiles.clear();
      try {
        const result = await acquireAndRunRole(role.id, null, { type: 'file_watch', files });
        if (!result.allowed) return;
      } catch (err) {
        console.error(`[cluster] File watch execution failed for role ${role.id}:`, err.message);
      }
    }, debounceMs);
  }

  _fileWatchers.push({ roleId: role.id, watcher });
  console.log(`[cluster] File watcher started for role ${role.id}: ${paths.join(', ')}`);
}

// ── Webhook Handler ──────────────────────────────────────────────

/**
 * Handle an incoming webhook request for a cluster role.
 * @param {string} clusterId - Cluster UUID
 * @param {string} roleId - Role UUID
 * @param {Request} request - Incoming request
 * @returns {Promise<Response>}
 */
export async function handleClusterWebhook(clusterId, roleId, request) {
  const roleData = getRoleWithCluster(roleId);
  if (!roleData || !roleData.cluster || roleData.cluster.id !== clusterId) {
    return Response.json({ error: 'Role not found or does not belong to this cluster' }, { status: 404 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    // No body is fine
  }

  const result = await acquireAndRunRole(roleData, payload, { type: 'webhook' });
  if (!result.allowed) {
    if (result.reason === 'disabled') {
      return Response.json({ error: 'Cluster is disabled' }, { status: 403 });
    }
    if (result.reason === 'concurrency') {
      return Response.json({ error: 'Max concurrency reached', max: roleData.maxConcurrency }, { status: 429 });
    }
    return Response.json({ error: result.reason }, { status: 500 });
  }

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ ok: true, containerName: result.containerName });
}
