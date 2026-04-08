import { createHash, timingSafeEqual } from 'crypto';
import { createAgentJob } from '../lib/tools/create-agent-job.js';
import { setWebhook } from '../lib/tools/telegram.js';
import { getAgentJobStatus, fetchAgentJobLog } from '../lib/tools/github.js';
import { getTelegramAdapter } from '../lib/channels/index.js';
import { chat, summarizeAgentJob } from '../lib/ai/index.js';
import { createNotification } from '../lib/db/notifications.js';
import { loadTriggers } from '../lib/triggers.js';
import { verifyApiKey } from '../lib/db/api-keys.js';
import { getConfig } from '../lib/config.js';
import { parseOAuthState, exchangeCodeForToken } from '../lib/oauth/helper.js';
import { setAgentJobSecret } from '../lib/db/config.js';
import { rateLimit, rateLimitResponse } from '../lib/rate-limit.js';

// ── Per-key lock for OAuth token refresh ────────────────────────────
const _refreshLocks = new Map();

// Bot token — resolved from DB/env, can be overridden by /telegram/register
let telegramBotToken = null;

// Cached trigger firing function (initialized on first request)
let _fireTriggers = null;

function getTelegramBotToken() {
  if (!telegramBotToken) {
    telegramBotToken = getConfig('TELEGRAM_BOT_TOKEN') || null;
  }
  return telegramBotToken;
}

function getFireTriggers() {
  if (!_fireTriggers) {
    const result = loadTriggers();
    _fireTriggers = result.fireTriggers;
  }
  return _fireTriggers;
}

// Routes that have their own authentication
const PUBLIC_ROUTES = ['/telegram/webhook', '/github/webhook', '/ping', '/oauth/callback'];

/**
 * Timing-safe string comparison.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Centralized auth gate for all API routes.
 * Public routes pass through; everything else requires a valid API key from the database.
 * @param {string} routePath - The route path
 * @param {Request} request - The incoming request
 * @returns {Response|null} - Error response or null if authorized
 */
function checkAuth(routePath, request) {
  if (PUBLIC_ROUTES.includes(routePath)) return { error: null, record: null };

  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }), record: null };
  }

  // Rate limit before verification — blocks brute-force on invalid keys too
  const rl = rateLimitResponse(rateLimit(`api:${apiKey.slice(-8)}`, 30, 60_000));
  if (rl) return { error: rl, record: null };

  const record = verifyApiKey(apiKey);
  if (!record) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }), record: null };
  }

  return { error: null, record };
}

/**
 * Extract agent job ID from branch name (e.g., "agent-job/abc123" -> "abc123")
 */
function extractAgentJobId(branchName) {
  if (!branchName) return null;
  if (branchName.startsWith('agent-job/')) return branchName.slice(10);
  // Backwards compatibility with old job/ prefix
  if (branchName.startsWith('job/')) return branchName.slice(4);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleCreateAgentJob(request) {
  const body = await request.json();
  const { job } = body;
  if (!job) return Response.json({ error: 'Missing job field' }, { status: 400 });

  try {
    const result = await createAgentJob(job, {
      llmModel: body.llm_model,
      agentBackend: body.agent_backend,
    });
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to create agent job' }, { status: 500 });
  }
}

async function handleGetAgentSecret(request) {
  const record = verifyApiKey(request.headers.get('x-api-key'));
  if (record.type !== 'agent_job_api_key') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const key = new URL(request.url).searchParams.get('key');
  if (!key) return Response.json({ error: 'Missing key' }, { status: 400 });

  const { getAgentJobSecretRaw, setAgentJobSecret: saveSecret } = await import('../lib/db/config.js');
  const raw = getAgentJobSecretRaw(key);
  if (!raw) return Response.json({ error: 'Not found' }, { status: 404 });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Plain string
    return Response.json({ value: raw });
  }

  if (parsed.type === 'oauth2') {
    // Serialize refresh per key — prevents concurrent requests from racing on token rotation
    if (!_refreshLocks.has(key)) _refreshLocks.set(key, Promise.resolve());
    let release;
    const gate = new Promise((r) => { release = r; });
    const prev = _refreshLocks.get(key);
    _refreshLocks.set(key, gate);
    await prev;

    try {
      // Re-read after acquiring lock — previous request may have already refreshed
      const freshRaw = getAgentJobSecretRaw(key);
      const freshParsed = freshRaw ? JSON.parse(freshRaw) : parsed;

      const { refreshOAuthToken } = await import('../lib/oauth/helper.js');
      const newToken = await refreshOAuthToken({
        refreshToken: freshParsed.token.refresh_token,
        clientId: freshParsed.clientId,
        clientSecret: freshParsed.clientSecret,
        tokenUrl: freshParsed.tokenUrl,
      });
      // Persist updated token (refresh token may have rotated)
      saveSecret(key, JSON.stringify({ ...freshParsed, token: { ...freshParsed.token, ...newToken } }), 'refresh');
      return Response.json({ value: newToken.access_token });
    } catch (err) {
      console.error(`[secrets] OAuth refresh failed for "${key}":`, err.message);
      return Response.json({ error: `OAuth refresh failed: ${err.message}` }, { status: 502 });
    } finally {
      release();
    }
  }
  if (parsed.type === 'oauth_token') {
    return Response.json({ value: JSON.stringify(parsed.token) });
  }
  // Unknown structured value — return raw
  return Response.json({ value: raw });
}

async function handleListAgentSecrets(request) {
  const record = verifyApiKey(request.headers.get('x-api-key'));
  if (record.type !== 'agent_job_api_key') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { listAgentJobSecrets } = await import('../lib/db/config.js');
  return Response.json({ secrets: listAgentJobSecrets() });
}

async function handleTelegramRegister(request) {
  const body = await request.json();
  const { bot_token, webhook_url } = body;
  if (!bot_token || !webhook_url) {
    return Response.json({ error: 'Missing bot_token or webhook_url' }, { status: 400 });
  }

  try {
    const result = await setWebhook(bot_token, webhook_url, getConfig('TELEGRAM_WEBHOOK_SECRET'));
    telegramBotToken = bot_token;
    return Response.json({ success: true, result });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}

async function handleTelegramWebhook(request) {
  const botToken = getTelegramBotToken();
  if (!botToken) return Response.json({ ok: true });

  const adapter = getTelegramAdapter(botToken);
  const normalized = await adapter.receive(request);
  if (!normalized) return Response.json({ ok: true });

  // Process message asynchronously (don't block the webhook response)
  processChannelMessage(adapter, normalized).catch((err) => {
    console.error('Failed to process message:', err);
  });

  return Response.json({ ok: true });
}

/**
 * Process a normalized message through the AI layer with channel UX.
 * Message persistence is handled centrally by the AI layer.
 */
async function processChannelMessage(adapter, normalized) {
  await adapter.acknowledge(normalized.metadata);
  const stopIndicator = adapter.startProcessingIndicator(normalized.metadata);

  try {
    const response = await chat(
      normalized.threadId,
      normalized.text,
      normalized.attachments,
      { userId: 'telegram', chatTitle: 'Telegram' }
    );
    await adapter.sendResponse(normalized.threadId, response, normalized.metadata);
  } catch (err) {
    console.error('Failed to process message with AI:', err);
    await adapter
      .sendResponse(
        normalized.threadId,
        'Sorry, I encountered an error processing your message.',
        normalized.metadata
      )
      .catch(() => {});
  } finally {
    stopIndicator();
  }
}

async function handleGithubWebhook(request) {
  const GH_WEBHOOK_SECRET = getConfig('GH_WEBHOOK_SECRET');

  // Validate webhook secret (timing-safe, required)
  if (!GH_WEBHOOK_SECRET || !safeCompare(request.headers.get('x-github-webhook-secret-token'), GH_WEBHOOK_SECRET)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const agentJobId = payload.agent_job_id || payload.job_id || extractAgentJobId(payload.branch);
  if (!agentJobId) return Response.json({ ok: true, skipped: true, reason: 'not an agent job' });

  try {
    // Fetch log from repo via API (no longer sent in payload)
    let log = payload.log || '';
    if (!log) {
      log = await fetchAgentJobLog(agentJobId, payload.commit_sha);
    }

    const results = {
      job: payload.job || '',
      pr_url: payload.pr_url || payload.run_url || '',
      run_url: payload.run_url || '',
      status: payload.status || '',
      merge_result: payload.merge_result || '',
      log,
      changed_files: payload.changed_files || [],
      commit_message: payload.commit_message || '',
    };

    const message = await summarizeAgentJob(results);
    await createNotification(message, payload);

    console.log(`Notification saved for agent-job ${agentJobId.slice(0, 8)}`);

    return Response.json({ ok: true, notified: true });
  } catch (err) {
    console.error('Failed to process GitHub webhook:', err);
    return Response.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

async function handleAgentJobStatus(request) {
  try {
    const url = new URL(request.url);
    const agentJobId = url.searchParams.get('agent_job_id') || url.searchParams.get('job_id');
    const result = await getAgentJobStatus(agentJobId);
    return Response.json(result);
  } catch (err) {
    console.error('Failed to get agent job status:', err);
    return Response.json({ error: 'Failed to get agent job status' }, { status: 500 });
  }
}

async function handleOAuthCallback(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    const desc = url.searchParams.get('error_description') || error;
    return oauthResultPage(false, desc);
  }

  if (!code || !stateParam) {
    return oauthResultPage(false, 'Missing code or state parameter.');
  }

  try {
    const state = parseOAuthState(stateParam);
    const redirectUri = `${process.env.AUTH_URL}/api/oauth/callback`;

    const tokenData = await exchangeCodeForToken({
      code,
      clientId: state.clientId,
      clientSecret: state.clientSecret,
      tokenUrl: state.tokenUrl,
      redirectUri,
    });

    // Save token with typed wrapper so the API can auto-refresh on fetch
    const secretType = state.secretType || 'oauth2';
    let stored;
    if (secretType === 'oauth_token') {
      stored = JSON.stringify({ type: 'oauth_token', token: tokenData });
    } else {
      stored = JSON.stringify({
        type: 'oauth2',
        token: tokenData,
        clientId: state.clientId,
        clientSecret: state.clientSecret,
        tokenUrl: state.tokenUrl,
      });
    }
    setAgentJobSecret(state.secretName, stored, 'oauth');

    return oauthResultPage(true, state.secretName);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return oauthResultPage(false, err.message || 'Token exchange failed.');
  }
}

function oauthResultPage(success, detail) {
  const safe = String(detail).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const messagePayload = JSON.stringify({ type: success ? 'oauth-success' : 'oauth-error', detail: safe });
  const fallback = success
    ? `Token saved as <strong>${safe}</strong>. You can close this tab and return to settings.`
    : `Error: ${safe}`;

  const html = `<!DOCTYPE html><html><head><title>OAuth ${success ? 'Success' : 'Error'}</title></head><body>
<script>
  if (window.opener) {
    window.opener.postMessage(${messagePayload}, window.location.origin);
    window.close();
  } else {
    document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem;">${fallback.replace(/'/g, "\\'")}</p>';
  }
</script>
<noscript><p style="font-family:sans-serif;padding:2rem;">${fallback}</p></noscript>
</body></html>`;
  return new Response(html, { status: success ? 200 : 400, headers: { 'Content-Type': 'text/html' } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Next.js Route Handlers (catch-all)
// ─────────────────────────────────────────────────────────────────────────────

async function POST(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');

  // Auth check
  const { error: authError, record: authRecord } = checkAuth(routePath, request);
  if (authError) return authError;

  // Fire triggers (non-blocking)
  try {
    const fireTriggers = getFireTriggers();
    // Clone request to read body for triggers without consuming it for the handler
    const clonedRequest = request.clone();
    const body = await clonedRequest.json().catch(() => ({}));
    const query = Object.fromEntries(url.searchParams);
    const headers = Object.fromEntries(request.headers);
    fireTriggers(routePath, body, query, headers);
  } catch (e) {
    // Trigger errors are non-fatal
  }

  // Cluster role webhooks
  const clusterMatch = routePath.match(/^\/cluster\/([a-f0-9-]+)\/role\/([a-f0-9-]+)\/webhook$/);
  if (clusterMatch) {
    if (authRecord?.type === 'agent_job_api_key') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { handleClusterWebhook } = await import('../lib/cluster/runtime.js');
    return handleClusterWebhook(clusterMatch[1], clusterMatch[2], request);
  }

  // Route to handler
  switch (routePath) {
    case '/create-agent-job': {
      if (authRecord?.type === 'agent_job_api_key') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const rl = rateLimitResponse(rateLimit(`agent-job:${request.headers.get('x-api-key')?.slice(-8)}`, 5, 60_000));
      if (rl) return rl;
      return handleCreateAgentJob(request);
    }
    case '/telegram/webhook':   return handleTelegramWebhook(request);
    case '/telegram/register':  return handleTelegramRegister(request);
    case '/github/webhook':     return handleGithubWebhook(request);
    default:                    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

async function GET(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');

  // Auth check
  const { error: authError } = checkAuth(routePath, request);
  if (authError) return authError;

  switch (routePath) {
    case '/ping':               return Response.json({ message: 'Pong!' });
    case '/agent-jobs/status':  return handleAgentJobStatus(request);
    case '/get-agent-job-secret':     return handleGetAgentSecret(request);
    case '/agent-job-list-secrets':  return handleListAgentSecrets(request);
    case '/oauth/callback':     return handleOAuthCallback(request);
    default:                    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

export { GET, POST };
