/**
 * Persistent container lifecycle state machine.
 *
 * Manages the lifecycle of Docker containers for code workspaces:
 * ensure they exist and are running, handle paused/stopped states,
 * and poll for readiness.
 */

/**
 * Build the deterministic container name for a persistent workspace.
 * @param {string} agent - Coding agent type (e.g. 'claude-code')
 * @param {string} workspaceId - Workspace UUID
 * @returns {string}
 */
function containerName(agent, workspaceId) {
  return `${agent}-persistent-${workspaceId.replace(/-/g, '').slice(0, 8)}`;
}

// Per-workspace mutex to prevent concurrent ensureContainer races
const ensureLocks = new Map();

/**
 * Ensure a container exists and is in a usable state for the given workspace.
 *
 * State machine:
 *   'ready'    → inspect container; if running return ready, else fall through to 'none'
 *   'paused'   → unpause → update status to 'ready' → return
 *   'stopped'  → start → update status to 'starting' → return (caller polls)
 *   'none'/'starting' → create new container → update status to 'starting' → return
 *
 * @param {string} workspaceId - Workspace ID
 * @param {object} [options]
 * @param {string} [options.codingAgent] - Override coding agent type
 * @param {boolean} [options.injectSecrets] - Inject agent job secrets into container
 * @returns {Promise<{status: string, containerName?: string, message?: string}>}
 */
export async function ensureContainer(workspaceId, options = {}) {
  // Serialize concurrent calls for the same workspace
  const prev = ensureLocks.get(workspaceId) || Promise.resolve();
  let resolve;
  const lock = new Promise((r) => { resolve = r; });
  ensureLocks.set(workspaceId, lock);
  await prev;
  try {
    return await _ensureContainerImpl(workspaceId, options);
  } finally {
    resolve();
    if (ensureLocks.get(workspaceId) === lock) ensureLocks.delete(workspaceId);
  }
}

async function _ensureContainerImpl(workspaceId, options = {}) {
  const { getCodeWorkspaceById, updateContainerName, updateContainerStatus } =
    await import('../db/code-workspaces.js');
  const { inspectContainer, runInteractiveContainer, startContainer, unpauseContainer } =
    await import('../tools/docker.js');

  try {
    const workspace = getCodeWorkspaceById(workspaceId);
    if (!workspace) {
      return { status: 'error', message: 'Workspace not found' };
    }

    const { getConfig } = await import('../config.js');
    const agent = options.codingAgent || getConfig('CODING_AGENT') || 'claude-code';
    const name = workspace.containerName || containerName(agent, workspaceId);
    const dbStatus = workspace.containerStatus || 'none';

    // --- State: ready ---
    if (dbStatus === 'ready') {
      const info = await inspectContainer(name);
      if (info && info.State?.Status === 'running') {
        return { status: 'ready', containerName: name };
      }
      // Container is dead or missing — fall through to create
    }

    // --- State: paused ---
    if (dbStatus === 'paused') {
      await unpauseContainer(name);
      updateContainerStatus(workspaceId, 'ready');
      return { status: 'ready', containerName: name };
    }

    // --- State: stopped ---
    if (dbStatus === 'stopped') {
      await startContainer(name);
      updateContainerStatus(workspaceId, 'starting');
      return { status: 'starting', containerName: name };
    }

    // --- State: none, starting, or ready-but-dead (fall-through) ---
    // Create a new container
    await runInteractiveContainer({
      containerName: name,
      repo: workspace.repo,
      branch: workspace.branch,
      featureBranch: workspace.featureBranch,
      workspaceId,
      codingAgent: agent,
      injectSecrets: options.injectSecrets ?? false,
    });

    // Persist the container name and set status to starting
    if (!workspace.containerName || workspace.containerName !== name) {
      updateContainerName(workspaceId, name);
    }
    updateContainerStatus(workspaceId, 'starting');

    return { status: 'starting', containerName: name };
  } catch (err) {
    // Reconcile: if container is missing, reset DB to 'none' so next call creates fresh
    try {
      const workspace = getCodeWorkspaceById(workspaceId);
      if (workspace?.containerName) {
        const info = await inspectContainer(workspace.containerName);
        if (!info) {
          updateContainerStatus(workspaceId, 'none');
        }
      }
    } catch { /* ignore reconciliation error */ }
    console.error(`[ensureContainer] workspace=${workspaceId}`, err);
    return { status: 'error', message: err.message };
  }
}

/**
 * Manage idle persistent containers by pausing, stopping, or removing them
 * based on how long they have been idle.
 *
 * Thresholds:
 *   > 7 days idle  → remove container, set status to 'none'
 *   > 6 hours idle → stop container, set status to 'stopped'
 *   > 30 min idle AND status is 'ready' → pause container, set status to 'paused'
 *
 * Idle time is measured from lastMessageAt (or containerStartedAt as fallback).
 * Errors on individual containers are caught so one failure doesn't stop the loop.
 */
export async function manageIdleContainers() {
  const THIRTY_MINUTES = 30 * 60 * 1000;
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  const { getWorkspacesForIdleManagement, updateContainerStatus } =
    await import('../db/code-workspaces.js');
  const { pauseContainer, stopContainer, removeContainer } =
    await import('../tools/docker.js');

  const workspaces = getWorkspacesForIdleManagement();

  for (const ws of workspaces) {
    try {
      const referenceTime = ws.lastMessageAt || ws.containerStartedAt;
      if (!referenceTime) continue;

      const idleMs = Date.now() - referenceTime;
      const name = ws.containerName;
      if (!name) continue;

      const oldStatus = ws.containerStatus;

      if (idleMs > SEVEN_DAYS) {
        await removeContainer(name);
        updateContainerStatus(ws.id, 'none');
        console.log(`[idle] Container ${name}: ${oldStatus} → none`);
      } else if (idleMs > SIX_HOURS) {
        if (oldStatus === 'stopped') continue;
        await stopContainer(name);
        updateContainerStatus(ws.id, 'stopped');
        console.log(`[idle] Container ${name}: ${oldStatus} → stopped`);
      } else if (idleMs > THIRTY_MINUTES && oldStatus === 'ready') {
        await pauseContainer(name);
        updateContainerStatus(ws.id, 'paused');
        console.log(`[idle] Container ${name}: ${oldStatus} → paused`);
      }
    } catch (err) {
      console.error(`[idle] Error managing container for workspace ${ws.id}: ${err.message}`);
    }
  }
}

/**
 * Audit all workspace containers on server startup.
 * Reconciles DB state with actual Docker state — handles containers that
 * died, were removed, or changed state while the server was down.
 */
export async function auditContainersOnStartup() {
  const { getWorkspacesForIdleManagement, updateContainerStatus } =
    await import('../db/code-workspaces.js');
  const { inspectContainer } = await import('../tools/docker.js');

  const workspaces = getWorkspacesForIdleManagement();
  const withContainers = workspaces.filter(ws => ws.containerName);
  let fixed = 0;

  // Inspect containers in parallel (up to 10 concurrent)
  const CONCURRENCY = 10;
  for (let i = 0; i < withContainers.length; i += CONCURRENCY) {
    const batch = withContainers.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async (ws) => {
      const info = await inspectContainer(ws.containerName);
      if (!info) {
        updateContainerStatus(ws.id, 'none');
        fixed++;
        console.log(`[startup-audit] ${ws.containerName}: missing → none`);
      } else {
        const dockerState = info.State?.Status;
        const dbStatus = ws.containerStatus;
        let newStatus;
        if (dockerState === 'running') newStatus = 'ready';
        else if (dockerState === 'paused') newStatus = 'paused';
        else if (dockerState === 'exited' || dockerState === 'created') newStatus = 'stopped';
        else newStatus = 'none';

        if (newStatus !== dbStatus) {
          updateContainerStatus(ws.id, newStatus);
          fixed++;
          console.log(`[startup-audit] ${ws.containerName}: ${dbStatus} → ${newStatus} (docker: ${dockerState})`);
        }
      }
    }));
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error(`[startup-audit] Error:`, r.reason?.message || r.reason);
      }
    }
  }

  console.log(`[startup-audit] Audited ${withContainers.length} containers, fixed ${fixed} status mismatches`);
}

/**
 * Poll until a workspace's container is ready (can execute commands).
 *
 * Checks every 1 second:
 *   1. If containerStatus is already 'ready' in DB, return true
 *   2. If a containerName exists, try execInContainer(name, 'true')
 *      — on success, update status to 'ready' and return true
 *   3. If timeout exceeded, throw Error
 *
 * @param {string} workspaceId - Workspace ID
 * @param {number} [maxMs=120000] - Maximum wait time in milliseconds
 * @returns {Promise<true>}
 * @throws {Error} If timeout exceeded
 */
export async function waitForContainerReady(workspaceId, maxMs = 120000) {
  const { getCodeWorkspaceById, updateContainerStatus } =
    await import('../db/code-workspaces.js');
  const { execInContainer } = await import('../tools/docker.js');

  const start = Date.now();

  while (Date.now() - start < maxMs) {
    const workspace = getCodeWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Already marked ready in DB
    if (workspace.containerStatus === 'ready') {
      return true;
    }

    // Try executing a no-op command to check if the container is responsive
    if (workspace.containerName) {
      try {
        const result = await execInContainer(workspace.containerName, 'true', 3000);
        if (result !== null) {
          updateContainerStatus(workspaceId, 'ready');
          return true;
        }
      } catch (err) {
        // Non-transient errors — fail fast instead of polling for 120s
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT') || msg.includes('ECONNREFUSED') || msg.includes('permission denied')) {
          throw new Error(`Docker unavailable while waiting for container: ${msg}`);
        }
        // Transient errors (exec timeout, container still starting) — continue polling
      }
    }

    // Wait 1 second before next check
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Container for workspace ${workspaceId} did not become ready within ${maxMs}ms`);
}

/**
 * Execute a prompt inside a persistent container and stream back parsed events.
 *
 * Builds an agent-specific CLI command, runs it via Docker exec, then pipes
 * the multiplexed Docker stream through the headless stream parser.
 *
 * @param {string} containerName - Docker container name
 * @param {string} codingAgent - Agent type (claude-code, codex-cli, gemini-cli, opencode, kimi-cli)
 * @param {string} prompt - The user prompt to send to the agent
 * @param {object} [options]
 * @param {string} [options.model] - Override model name
 * @param {'plan'|'code'} [options.codeMode] - Permission mode (plan = read-only where supported)
 * @yields {{ type: string, text?: string, toolCallId?: string, toolName?: string, args?: object, result?: string }}
 */
export async function* execPrompt(containerName, codingAgent, prompt, options = {}) {
  const { execStreamInContainer } = await import('../tools/docker.js');
  const { parseHeadlessStream } = await import('../ai/headless-stream.js');

  const cmd = buildAgentCommand(codingAgent, prompt, options);
  console.log(`[execPrompt] cmd=${JSON.stringify(cmd).slice(0, 200)}`);
  const stream = await execStreamInContainer(containerName, cmd);
  console.log(`[execPrompt] stream received, statusCode=${stream.statusCode}, headers=${JSON.stringify(stream.headers || {}).slice(0, 200)}`);

  // Debug: track raw bytes from Docker exec stream
  let totalBytes = 0;
  stream.on('data', (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes <= 500) console.log(`[execPrompt] raw chunk: ${chunk.length}B, hex=${chunk.slice(0, 16).toString('hex')}`);
  });
  stream.on('end', () => console.log(`[execPrompt] stream ended, totalBytes=${totalBytes}`));
  stream.on('error', (err) => console.error(`[execPrompt] stream error:`, err.message));

  try {
    for await (const event of parseHeadlessStream(stream, codingAgent)) {
      yield event;
    }
  } finally {
    if (stream && typeof stream.destroy === 'function') {
      stream.destroy();
    }
  }
}

/**
 * Build the CLI command array for a given coding agent.
 *
 * Returns an array suitable for Docker exec Cmd (no shell interpolation).
 * Agents that need shell features (e.g. env var expansion) are wrapped in
 * ['bash', '-c', '...'] with the prompt properly escaped.
 *
 * @param {string} codingAgent
 * @param {string} prompt
 * @param {{ model?: string, codeMode?: string }} options
 * @returns {string[]}
 */
function buildAgentCommand(codingAgent, prompt, options = {}) {
  switch (codingAgent) {
    case 'claude-code': {
      const cmd = ['claude', '-p', prompt, '--output-format', 'stream-json', '--verbose'];
      if (options.model) cmd.push('--model', options.model);
      if (options.codeMode === 'plan') cmd.push('--permission-mode', 'plan');
      return cmd;
    }

    case 'codex-cli':
      return ['codex', '-q', prompt];

    case 'gemini-cli': {
      const cmd = ['gemini', '-p', prompt];
      if (options.model) cmd.push('--model', options.model);
      return cmd;
    }

    case 'opencode':
      return ['opencode', 'run', prompt];

    case 'kimi-cli':
      return ['kimi', '-p', prompt];

    default:
      throw new Error(`Unknown coding agent: ${codingAgent}`);
  }
}
