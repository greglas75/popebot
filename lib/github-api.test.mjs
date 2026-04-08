import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./config.js', () => ({
  getConfig: vi.fn(() => null),
}));

const { getConfig } = await import('./config.js');
const {
  listGitHubSecrets,
  setGitHubSecret,
  deleteGitHubSecret,
  listGitHubVariables,
  setGitHubVariable,
  deleteGitHubVariable,
} = await import('./github-api.js');

const originalEnv = { ...process.env };
let fetchMock;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GH_OWNER = 'test-owner';
  process.env.GH_REPO = 'test-repo';
  getConfig.mockReturnValue('ghp_test_token');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  process.env.GH_OWNER = originalEnv.GH_OWNER;
  process.env.GH_REPO = originalEnv.GH_REPO;
  vi.unstubAllGlobals();
});

function okJson(body, status = 200) {
  return { ok: true, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}
function ok204() {
  return { ok: true, status: 204, json: () => null, text: () => Promise.resolve('') };
}
function failJson(body, status) {
  return { ok: false, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

// ── Shared auth/config edge cases ──────────────────────────────────────────

describe('auth and config edge cases', () => {
  it('returns error when GH_OWNER missing but GH_REPO set', async () => {
    delete process.env.GH_OWNER;
    expect(await listGitHubSecrets()).toEqual({ error: 'GitHub not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns error when GH_REPO missing but GH_OWNER set', async () => {
    delete process.env.GH_REPO;
    expect(await listGitHubVariables()).toEqual({ error: 'GitHub not configured' });
  });

  it('returns error when GH_TOKEN is null', async () => {
    getConfig.mockReturnValue(null);
    expect(await listGitHubSecrets()).toEqual({ error: 'GitHub not configured' });
  });

  it('returns error when getConfig throws (DB error)', async () => {
    getConfig.mockImplementation(() => { throw new Error('DB down'); });
    // Error propagates through ghFetch catch → function-level catch → { error: message }
    expect(await listGitHubSecrets()).toEqual({ error: 'DB down' });
  });

  it('returns error when fetch throws (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await listGitHubSecrets();
    expect(result).toEqual({ error: expect.stringContaining('ECONNREFUSED') });
  });
});

// ── ghFetch internals ──────────────────────────────────────────────────────

describe('ghFetch request format', () => {
  it('sends correct Authorization and API version headers', async () => {
    fetchMock.mockResolvedValue(okJson({ secrets: [] }));
    await listGitHubSecrets();
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer ghp_test_token');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(headers.Accept).toBe('application/vnd.github+json');
  });

  it('includes AbortSignal for timeout', async () => {
    fetchMock.mockResolvedValue(okJson({ secrets: [] }));
    await listGitHubSecrets();
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

// ── Secrets ────────────────────────────────────────────────────────────────

describe('listGitHubSecrets', () => {
  it('returns mapped secrets on success', async () => {
    fetchMock.mockResolvedValue(okJson({
      secrets: [
        { name: 'SECRET_A', updated_at: '2026-01-01T00:00:00Z' },
        { name: 'SECRET_B', updated_at: '2026-01-02T00:00:00Z' },
      ],
    }));
    expect(await listGitHubSecrets()).toEqual([
      { name: 'SECRET_A', updatedAt: '2026-01-01T00:00:00Z' },
      { name: 'SECRET_B', updatedAt: '2026-01-02T00:00:00Z' },
    ]);
  });

  it('handles empty secrets list', async () => {
    fetchMock.mockResolvedValue(okJson({ secrets: [] }));
    expect(await listGitHubSecrets()).toEqual([]);
  });

  it('returns error on API failure', async () => {
    fetchMock.mockResolvedValue(failJson({ message: 'Bad credentials' }, 401));
    expect(await listGitHubSecrets()).toEqual({ error: expect.stringContaining('401') });
  });
});

describe('deleteGitHubSecret', () => {
  it('returns success on 204', async () => {
    fetchMock.mockResolvedValue(ok204());
    expect(await deleteGitHubSecret('MY_SECRET')).toEqual({ success: true });
    expect(fetchMock.mock.calls[0][0]).toContain('/actions/secrets/MY_SECRET');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('returns error on failure', async () => {
    fetchMock.mockResolvedValue(failJson({}, 404));
    expect(await deleteGitHubSecret('MISSING')).toEqual({ error: expect.stringContaining('404') });
  });
});

// ── Variables ──────────────────────────────────────────────────────────────

describe('listGitHubVariables', () => {
  it('returns mapped variables on success', async () => {
    fetchMock.mockResolvedValue(okJson({
      variables: [{ name: 'VAR_A', value: 'val-a', updated_at: '2026-03-01T00:00:00Z' }],
    }));
    expect(await listGitHubVariables()).toEqual([
      { name: 'VAR_A', value: 'val-a', updatedAt: '2026-03-01T00:00:00Z' },
    ]);
  });
});

describe('setGitHubVariable', () => {
  it('PATCHes existing variable', async () => {
    fetchMock.mockResolvedValue(ok204());
    expect(await setGitHubVariable('MY_VAR', 'new-value')).toEqual({ success: true });
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });

  it('falls back to POST when PATCH 404s (new variable)', async () => {
    fetchMock
      .mockResolvedValueOnce(failJson({}, 404))
      .mockResolvedValueOnce(okJson(null, 201));
    expect(await setGitHubVariable('NEW_VAR', 'val')).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });

  it('returns error when both PATCH and POST fail', async () => {
    fetchMock
      .mockResolvedValueOnce(failJson({}, 404))
      .mockRejectedValueOnce(new Error('POST also failed'));
    expect(await setGitHubVariable('BAD_VAR', 'val')).toEqual({ error: expect.stringContaining('POST also failed') });
  });
});

describe('deleteGitHubVariable', () => {
  it('returns success on 204', async () => {
    fetchMock.mockResolvedValue(ok204());
    expect(await deleteGitHubVariable('MY_VAR')).toEqual({ success: true });
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('returns error on API failure', async () => {
    fetchMock.mockResolvedValue(failJson({}, 500));
    expect(await deleteGitHubVariable('MY_VAR')).toEqual({ error: expect.stringContaining('500') });
  });
});

// ── setGitHubSecret (encryption flow) ──────────────────────────────────────

describe('setGitHubSecret', () => {
  it('returns error when not configured', async () => {
    delete process.env.GH_OWNER;
    expect(await setGitHubSecret('SECRET', 'value')).toEqual({ error: 'GitHub not configured' });
  });

  it('returns error when public key fetch fails', async () => {
    fetchMock.mockResolvedValue(failJson({}, 500));
    expect(await setGitHubSecret('SECRET', 'value')).toEqual({ error: expect.stringContaining('500') });
  });

  it('returns error when fetch throws network error', async () => {
    fetchMock.mockRejectedValue(new Error('Network timeout'));
    expect(await setGitHubSecret('SECRET', 'value')).toEqual({ error: 'Network timeout' });
  });
});
