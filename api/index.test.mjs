import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock all external dependencies before import ────────────────────────────

vi.mock('../lib/tools/create-agent-job.js', () => ({ createAgentJob: vi.fn() }));
vi.mock('../lib/tools/telegram.js', () => ({ setWebhook: vi.fn() }));
vi.mock('../lib/tools/github.js', () => ({ getAgentJobStatus: vi.fn(), fetchAgentJobLog: vi.fn() }));
vi.mock('../lib/channels/index.js', () => ({ getTelegramAdapter: vi.fn() }));
vi.mock('../lib/ai/index.js', () => ({ chat: vi.fn(), summarizeAgentJob: vi.fn() }));
vi.mock('../lib/db/notifications.js', () => ({ createNotification: vi.fn() }));
vi.mock('../lib/triggers.js', () => ({ loadTriggers: vi.fn(() => ({ fireTriggers: vi.fn() })) }));
vi.mock('../lib/db/api-keys.js', () => ({ verifyApiKey: vi.fn() }));
vi.mock('../lib/config.js', () => ({ getConfig: vi.fn() }));
vi.mock('../lib/oauth/helper.js', () => ({
  parseOAuthState: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  refreshOAuthToken: vi.fn(),
}));
vi.mock('../lib/db/config.js', () => ({
  setAgentJobSecret: vi.fn(),
  getAgentJobSecretRaw: vi.fn(),
  listAgentJobSecrets: vi.fn(),
}));
vi.mock('../lib/rate-limit.js', () => ({
  rateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitResponse: vi.fn(() => null),
}));
vi.mock('../lib/cluster/runtime.js', () => ({ handleClusterWebhook: vi.fn() }));

// ── Import module under test + mocked deps ──────────────────────────────────

const { GET, POST, _resetForTest } = await import('./index.js');
const { createAgentJob } = await import('../lib/tools/create-agent-job.js');
const { setWebhook } = await import('../lib/tools/telegram.js');
const { getAgentJobStatus, fetchAgentJobLog } = await import('../lib/tools/github.js');
const { getTelegramAdapter } = await import('../lib/channels/index.js');
const { chat, summarizeAgentJob } = await import('../lib/ai/index.js');
const { createNotification } = await import('../lib/db/notifications.js');
const { verifyApiKey } = await import('../lib/db/api-keys.js');
const { getConfig } = await import('../lib/config.js');
const { parseOAuthState, exchangeCodeForToken, refreshOAuthToken } = await import('../lib/oauth/helper.js');
const { setAgentJobSecret, getAgentJobSecretRaw, listAgentJobSecrets } = await import('../lib/db/config.js');
const { rateLimit, rateLimitResponse } = await import('../lib/rate-limit.js');
const { handleClusterWebhook } = await import('../lib/cluster/runtime.js');

// ── Helpers ─────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';

function req(method, path, { headers = {}, body } = {}) {
  const init = { method, headers: new Headers(headers) };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers.set('Content-Type', 'application/json');
  }
  return new Request(`${BASE}/api${path}`, init);
}

function authed(method, path, opts = {}) {
  return req(method, path, {
    ...opts,
    headers: { 'x-api-key': 'tpb_testkey12345678', ...opts.headers },
  });
}

/** Flush fire-and-forget async work (e.g. processChannelMessage).
 *  Two ticks to drain chained awaits (receive → chat → sendResponse). */
function flushAsync() {
  return new Promise((r) => setTimeout(r, 0)).then(() => new Promise((r) => setTimeout(r, 0)));
}

// ── Setup ───────────────────────────────────────────────────────────────────

const savedAuthUrl = process.env.AUTH_URL;

beforeEach(() => {
  vi.resetAllMocks();
  _resetForTest();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  rateLimit.mockReturnValue({ allowed: true });
  rateLimitResponse.mockReturnValue(null);
  verifyApiKey.mockReturnValue({ type: 'user_api_key', name: 'Test' });
});

afterEach(() => {
  // Restore AUTH_URL if changed by OAuth tests
  if (savedAuthUrl !== undefined) process.env.AUTH_URL = savedAuthUrl;
  else delete process.env.AUTH_URL;
});

// ═════════════════════════════════════════════════════════════════════════════
// checkAuth — centralized auth gate
// ═════════════════════════════════════════════════════════════════════════════

describe('checkAuth', () => {
  it('returns 401 when x-api-key header is missing', async () => {
    const res = await GET(req('GET', '/agent-jobs/status'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('returns 401 when API key is invalid', async () => {
    verifyApiKey.mockReturnValue(null);
    const res = await GET(authed('GET', '/agent-jobs/status'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(verifyApiKey).toHaveBeenCalledWith('tpb_testkey12345678');
  });

  it('returns rate-limit response when key is rate-limited', async () => {
    const rlRes = Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } });
    rateLimitResponse.mockReturnValue(rlRes);
    const res = await GET(authed('GET', '/agent-jobs/status'));
    expect(res.status).toBe(429);
    // Last 8 chars of 'tpb_testkey12345678' → '12345678'
    expect(rateLimit).toHaveBeenCalledWith('api:12345678', 30, 60_000);
  });

  it('skips auth for public routes', async () => {
    const res = await GET(req('GET', '/ping'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Pong!' });
    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /telegram/webhook
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /telegram/webhook', () => {
  it('returns ok immediately when no bot token is configured', async () => {
    getConfig.mockReturnValue(null);
    const res = await POST(req('POST', '/telegram/webhook', { body: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(getTelegramAdapter).not.toHaveBeenCalled();
  });

  it('returns ok when adapter.receive returns null (non-message update)', async () => {
    getConfig.mockImplementation((k) => (k === 'TELEGRAM_BOT_TOKEN' ? 'bot-tok' : null));
    getTelegramAdapter.mockReturnValue({ receive: vi.fn().mockResolvedValue(null) });

    const res = await POST(req('POST', '/telegram/webhook', { body: { update_id: 1 } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('processes message asynchronously and returns ok', async () => {
    getConfig.mockImplementation((k) => (k === 'TELEGRAM_BOT_TOKEN' ? 'bot-tok' : null));
    const stopFn = vi.fn();
    const adapter = {
      receive: vi.fn().mockResolvedValue({
        threadId: 't-1', text: 'hello', attachments: [], metadata: { chatId: 99 },
      }),
      acknowledge: vi.fn().mockResolvedValue(undefined),
      startProcessingIndicator: vi.fn().mockReturnValue(stopFn),
      sendResponse: vi.fn().mockResolvedValue(undefined),
    };
    getTelegramAdapter.mockReturnValue(adapter);
    chat.mockResolvedValue('AI reply');

    const res = await POST(req('POST', '/telegram/webhook', { body: { message: {} } }));
    expect(res.status).toBe(200);

    await flushAsync();
    expect(chat).toHaveBeenCalledWith('t-1', 'hello', [], { userId: 'telegram', chatTitle: 'Telegram' });
    expect(adapter.sendResponse).toHaveBeenCalledWith('t-1', 'AI reply', { chatId: 99 });
    expect(stopFn).toHaveBeenCalled();
  });

  it('sends error message when chat() rejects', async () => {
    getConfig.mockImplementation((k) => (k === 'TELEGRAM_BOT_TOKEN' ? 'bot-tok' : null));
    const adapter = {
      receive: vi.fn().mockResolvedValue({
        threadId: 't-2', text: 'hi', attachments: [], metadata: { chatId: 1 },
      }),
      acknowledge: vi.fn().mockResolvedValue(undefined),
      startProcessingIndicator: vi.fn().mockReturnValue(vi.fn()),
      sendResponse: vi.fn().mockResolvedValue(undefined),
    };
    getTelegramAdapter.mockReturnValue(adapter);
    chat.mockRejectedValue(new Error('LLM down'));

    await POST(req('POST', '/telegram/webhook', { body: {} }));
    await flushAsync();

    expect(adapter.sendResponse).toHaveBeenCalledWith(
      't-2',
      'Sorry, I encountered an error processing your message.',
      { chatId: 1 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /telegram/register
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /telegram/register', () => {
  it('returns 400 when bot_token or webhook_url is missing', async () => {
    const res = await POST(authed('POST', '/telegram/register', { body: { bot_token: 'tok' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing bot_token or webhook_url' });
  });

  it('registers webhook and returns success', async () => {
    setWebhook.mockResolvedValue({ ok: true });
    const res = await POST(authed('POST', '/telegram/register', {
      body: { bot_token: 'new-tok', webhook_url: 'https://example.com/hook' },
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(setWebhook).toHaveBeenCalledWith('new-tok', 'https://example.com/hook', undefined);
  });

  it('returns 500 when setWebhook throws', async () => {
    const err = new Error('Telegram API error');
    setWebhook.mockRejectedValue(err);
    const res = await POST(authed('POST', '/telegram/register', {
      body: { bot_token: 't', webhook_url: 'https://x.com/h' },
    }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to register webhook' });
    expect(console.error).toHaveBeenCalledWith(err);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /create-agent-job
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /create-agent-job', () => {
  it('returns 403 when caller has agent_job_api_key type', async () => {
    verifyApiKey.mockReturnValue({ type: 'agent_job_api_key' });
    const res = await POST(authed('POST', '/create-agent-job', { body: { job: 'x' } }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(createAgentJob).not.toHaveBeenCalled();
  });

  it('returns 429 when per-route rate limit is exceeded', async () => {
    const rlRes = Response.json({ error: 'Too many requests' }, { status: 429 });
    // First call (checkAuth) passes, second call (route) blocks
    rateLimitResponse.mockReturnValueOnce(null).mockReturnValueOnce(rlRes);
    const res = await POST(authed('POST', '/create-agent-job', { body: { job: 'x' } }));
    expect(res.status).toBe(429);
    expect(rateLimit).toHaveBeenCalledTimes(2);
    expect(rateLimit).toHaveBeenNthCalledWith(2, expect.stringContaining('agent-job:'), 5, 60_000);
  });

  it('returns 400 when job field is missing', async () => {
    const res = await POST(authed('POST', '/create-agent-job', { body: { not_job: 'x' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing job field' });
  });

  it('creates agent job and returns result', async () => {
    const result = { id: 'j-1', branch: 'agent-job/abc', status: 'created' };
    createAgentJob.mockResolvedValue(result);
    const res = await POST(authed('POST', '/create-agent-job', {
      body: { job: 'Fix bug', llm_model: 'claude-opus-4-6', agent_backend: 'claude-code' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(createAgentJob).toHaveBeenCalledWith('Fix bug', {
      llmModel: 'claude-opus-4-6', agentBackend: 'claude-code',
    });
  });

  it('returns 500 when createAgentJob throws', async () => {
    const err = new Error('Docker error');
    createAgentJob.mockRejectedValue(err);
    const res = await POST(authed('POST', '/create-agent-job', { body: { job: 'x' } }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to create agent job' });
    expect(console.error).toHaveBeenCalledWith(err);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /github/webhook
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /github/webhook', () => {
  const GH_SECRET = 'gh-webhook-secret-value';

  function ghReq(payload, secret = GH_SECRET) {
    return req('POST', '/github/webhook', {
      body: payload,
      headers: { 'x-github-webhook-secret-token': secret },
    });
  }

  beforeEach(() => {
    getConfig.mockImplementation((k) => (k === 'GH_WEBHOOK_SECRET' ? GH_SECRET : null));
  });

  it('returns 401 when webhook secret is not configured', async () => {
    getConfig.mockReturnValue(null);
    const res = await POST(ghReq({ agent_job_id: 'x' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when webhook secret does not match (timing-safe)', async () => {
    const res = await POST(ghReq({ agent_job_id: 'x' }, 'wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('returns skipped when payload has no agent job identifier', async () => {
    const res = await POST(ghReq({ branch: 'feature/unrelated' }));
    const data = await res.json();
    expect(data).toEqual({ ok: true, skipped: true, reason: 'not an agent job' });
  });

  it('fetches log from GitHub API when not included in payload', async () => {
    fetchAgentJobLog.mockResolvedValue('fetched-log');
    summarizeAgentJob.mockResolvedValue('Summary');
    createNotification.mockResolvedValue(undefined);

    await POST(ghReq({ agent_job_id: 'abc', commit_sha: 'sha1' }));
    expect(fetchAgentJobLog).toHaveBeenCalledWith('abc', 'sha1');
    expect(summarizeAgentJob).toHaveBeenCalledWith(expect.objectContaining({ log: 'fetched-log' }));
  });

  it('summarizes and creates notification for completed agent job', async () => {
    summarizeAgentJob.mockResolvedValue('Job done');
    createNotification.mockResolvedValue(undefined);

    const payload = {
      agent_job_id: 'j-1', job: 'Fix bug', pr_url: 'https://gh.com/pr/1',
      status: 'completed', log: 'OK',
    };
    const res = await POST(ghReq(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: true });
    expect(createNotification).toHaveBeenCalledWith('Job done', payload);
  });

  it('extracts agent job ID from agent-job/ branch prefix', async () => {
    summarizeAgentJob.mockResolvedValue('S');
    createNotification.mockResolvedValue(undefined);

    const res = await POST(ghReq({ branch: 'agent-job/xyz789', log: 'l' }));
    expect(await res.json()).toEqual({ ok: true, notified: true });
  });

  it('extracts agent job ID from legacy job/ branch prefix', async () => {
    summarizeAgentJob.mockResolvedValue('S');
    createNotification.mockResolvedValue(undefined);

    const res = await POST(ghReq({ branch: 'job/old123', log: 'l' }));
    expect(await res.json()).toEqual({ ok: true, notified: true });
  });

  it('uses job_id fallback when agent_job_id is absent', async () => {
    summarizeAgentJob.mockResolvedValue('S');
    createNotification.mockResolvedValue(undefined);

    const res = await POST(ghReq({ job_id: 'fallback-id', log: 'l' }));
    expect(await res.json()).toEqual({ ok: true, notified: true });
  });

  it('returns 500 when processing fails', async () => {
    const err = new Error('AI error');
    summarizeAgentJob.mockRejectedValue(err);
    const res = await POST(ghReq({ agent_job_id: 'fail', log: 'l' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to process webhook' });
    expect(console.error).toHaveBeenCalledWith('Failed to process GitHub webhook:', err);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /cluster/:clusterId/role/:roleId/webhook
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /cluster webhook', () => {
  const CLUSTER_PATH = '/cluster/a1b2c3d4-e5f6-7890-abcd-ef1234567890/role/f0e1d2c3-b4a5-6789-0abc-def123456789/webhook';

  it('returns 403 when caller has agent_job_api_key type', async () => {
    verifyApiKey.mockReturnValue({ type: 'agent_job_api_key' });
    const res = await POST(authed('POST', CLUSTER_PATH, { body: {} }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(handleClusterWebhook).not.toHaveBeenCalled();
  });

  it('delegates to handleClusterWebhook with extracted IDs', async () => {
    const mockRes = Response.json({ ok: true });
    handleClusterWebhook.mockResolvedValue(mockRes);

    const res = await POST(authed('POST', CLUSTER_PATH, { body: { data: 'test' } }));
    expect(res.status).toBe(200);
    expect(handleClusterWebhook).toHaveBeenCalledWith(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'f0e1d2c3-b4a5-6789-0abc-def123456789',
      expect.any(Request),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /agent-jobs/status
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /agent-jobs/status', () => {
  it('returns agent job status', async () => {
    const status = { id: 'j-1', status: 'running', progress: 50 };
    getAgentJobStatus.mockResolvedValue(status);
    const res = await GET(authed('GET', '/agent-jobs/status?agent_job_id=j-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(status);
    expect(getAgentJobStatus).toHaveBeenCalledWith('j-1');
  });

  it('returns 500 when getAgentJobStatus throws', async () => {
    const err = new Error('GitHub API error');
    getAgentJobStatus.mockRejectedValue(err);
    const res = await GET(authed('GET', '/agent-jobs/status?agent_job_id=fail'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to get agent job status' });
    expect(console.error).toHaveBeenCalledWith('Failed to get agent job status:', err);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /get-agent-job-secret
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /get-agent-job-secret', () => {
  beforeEach(() => {
    verifyApiKey.mockReturnValue({ type: 'agent_job_api_key' });
  });

  it('returns 403 when key type is not agent_job_api_key', async () => {
    verifyApiKey.mockReturnValue({ type: 'user_api_key' });
    const res = await GET(authed('GET', '/get-agent-job-secret?key=test'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when key query param is missing', async () => {
    const res = await GET(authed('GET', '/get-agent-job-secret'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing key' });
  });

  it('returns 404 when secret is not found', async () => {
    getAgentJobSecretRaw.mockReturnValue(null);
    const res = await GET(authed('GET', '/get-agent-job-secret?key=missing'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns plain string value for non-JSON secrets', async () => {
    getAgentJobSecretRaw.mockReturnValue('plain-secret');
    const res = await GET(authed('GET', '/get-agent-job-secret?key=simple'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'plain-secret' });
  });

  it('refreshes oauth2 token and returns new access_token', async () => {
    const stored = {
      type: 'oauth2',
      token: { refresh_token: 'rt-old', access_token: 'at-old' },
      clientId: 'cid', clientSecret: 'cs',
      tokenUrl: 'https://oauth.example.com/token',
    };
    getAgentJobSecretRaw.mockReturnValue(JSON.stringify(stored));
    refreshOAuthToken.mockResolvedValue({ access_token: 'at-new', refresh_token: 'rt-new' });

    const res = await GET(authed('GET', '/get-agent-job-secret?key=my-oauth'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'at-new' });

    expect(refreshOAuthToken).toHaveBeenCalledWith({
      refreshToken: 'rt-old', clientId: 'cid', clientSecret: 'cs',
      tokenUrl: 'https://oauth.example.com/token',
    });
    // Verify persisted token merges old + new
    const savedArg = setAgentJobSecret.mock.calls[0][1];
    const savedToken = JSON.parse(savedArg).token;
    expect(savedToken.access_token).toBe('at-new');
    expect(savedToken.refresh_token).toBe('rt-new');
  });

  it('returns 502 when oauth2 refresh fails', async () => {
    const stored = {
      type: 'oauth2', token: { refresh_token: 'rt' },
      clientId: 'c', clientSecret: 's', tokenUrl: 'https://x.com/t',
    };
    getAgentJobSecretRaw.mockReturnValue(JSON.stringify(stored));
    refreshOAuthToken.mockRejectedValue(new Error('token revoked'));

    const res = await GET(authed('GET', '/get-agent-job-secret?key=broken'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'OAuth refresh failed' });
    expect(console.error).toHaveBeenCalledWith(
      '[secrets] OAuth refresh failed for "broken":', 'token revoked',
    );
  });

  it('returns JSON-stringified token for oauth_token type', async () => {
    const data = { type: 'oauth_token', token: { access_token: 'at', scope: 'read' } };
    getAgentJobSecretRaw.mockReturnValue(JSON.stringify(data));

    const res = await GET(authed('GET', '/get-agent-job-secret?key=tok'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      value: JSON.stringify({ access_token: 'at', scope: 'read' }),
    });
  });

  it('returns raw value for unknown structured JSON type', async () => {
    const raw = JSON.stringify({ type: 'custom', data: 'payload' });
    getAgentJobSecretRaw.mockReturnValue(raw);

    const res = await GET(authed('GET', '/get-agent-job-secret?key=custom'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: raw });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /agent-job-list-secrets
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /agent-job-list-secrets', () => {
  it('returns 403 when key type is not agent_job_api_key', async () => {
    // Default mock: type 'user_api_key'
    const res = await GET(authed('GET', '/agent-job-list-secrets'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns list of secrets', async () => {
    verifyApiKey.mockReturnValue({ type: 'agent_job_api_key' });
    const secrets = [{ key: 'API_KEY', isSet: true }];
    listAgentJobSecrets.mockReturnValue(secrets);

    const res = await GET(authed('GET', '/agent-job-list-secrets'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ secrets });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /oauth/callback
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /oauth/callback', () => {
  beforeEach(() => {
    process.env.AUTH_URL = 'https://app.example.com';
  });

  it('returns error HTML page when error query param is present', async () => {
    const res = await GET(req('GET', '/oauth/callback?error=access_denied&error_description=User+denied'));
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toBe('text/html');
    const html = await res.text();
    expect(html).toContain('User denied');
  });

  it('returns error page when code or state param is missing', async () => {
    const res = await GET(req('GET', '/oauth/callback?code=abc'));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Missing code or state parameter');
  });

  it('saves oauth_token type and returns success page', async () => {
    parseOAuthState.mockReturnValue({
      secretName: 'my-token', clientId: 'cid', clientSecret: 'cs',
      tokenUrl: 'https://provider.com/token', secretType: 'oauth_token',
    });
    exchangeCodeForToken.mockResolvedValue({ access_token: 'at', refresh_token: 'rt' });

    const res = await GET(req('GET', '/oauth/callback?code=auth-code&state=enc-state'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('my-token');

    expect(setAgentJobSecret).toHaveBeenCalledWith(
      'my-token',
      JSON.stringify({ type: 'oauth_token', token: { access_token: 'at', refresh_token: 'rt' } }),
      'oauth',
    );
    expect(exchangeCodeForToken).toHaveBeenCalledWith({
      code: 'auth-code', clientId: 'cid', clientSecret: 'cs',
      tokenUrl: 'https://provider.com/token',
      redirectUri: 'https://app.example.com/api/oauth/callback',
    });
  });

  it('saves oauth2 type with client credentials and returns success page', async () => {
    parseOAuthState.mockReturnValue({
      secretName: 'oauth-sec', clientId: 'cid', clientSecret: 'cs',
      tokenUrl: 'https://provider.com/token',
      // no secretType → defaults to 'oauth2'
    });
    exchangeCodeForToken.mockResolvedValue({ access_token: 'at', refresh_token: 'rt' });

    const res = await GET(req('GET', '/oauth/callback?code=code&state=state'));
    expect(res.status).toBe(200);

    const storedArg = setAgentJobSecret.mock.calls[0][1];
    const stored = JSON.parse(storedArg);
    expect(stored).toEqual({
      type: 'oauth2',
      token: { access_token: 'at', refresh_token: 'rt' },
      clientId: 'cid', clientSecret: 'cs',
      tokenUrl: 'https://provider.com/token',
    });
  });

  it('returns error page when token exchange fails', async () => {
    parseOAuthState.mockReturnValue({
      secretName: 's', clientId: 'c', clientSecret: 'cs', tokenUrl: 'https://x.com/t',
    });
    const err = new Error('Invalid grant');
    exchangeCodeForToken.mockRejectedValue(err);

    const res = await GET(req('GET', '/oauth/callback?code=bad&state=st'));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Invalid grant');
    expect(console.error).toHaveBeenCalledWith('OAuth callback error:', err);
  });

  it('returns error page when parseOAuthState throws', async () => {
    parseOAuthState.mockImplementation(() => { throw new Error('Decrypt failed'); });

    const res = await GET(req('GET', '/oauth/callback?code=x&state=bad'));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Decrypt failed');
    expect(console.error).toHaveBeenCalledWith('OAuth callback error:', expect.any(Error));
  });

  it('sanitizes HTML special characters to prevent XSS in error detail', async () => {
    const res = await GET(req('GET', '/oauth/callback?error=xss&error_description=<script>alert(1)</script>'));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 404 — unknown routes
// ═════════════════════════════════════════════════════════════════════════════

describe('404 handling', () => {
  it('returns 404 for unknown POST route', async () => {
    const res = await POST(authed('POST', '/nonexistent', { body: {} }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 404 for unknown GET route', async () => {
    const res = await GET(authed('GET', '/nonexistent'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});
