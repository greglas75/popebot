import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock getConfig before importing github-api
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

// Save and restore env + fetch
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

// Helper to create mock Response
function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe('listGitHubSecrets', () => {
  it('returns mapped secrets on success', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      secrets: [
        { name: 'SECRET_A', updated_at: '2026-01-01T00:00:00Z' },
        { name: 'SECRET_B', updated_at: '2026-01-02T00:00:00Z' },
      ],
    }));

    const result = await listGitHubSecrets();
    expect(result).toEqual([
      { name: 'SECRET_A', updatedAt: '2026-01-01T00:00:00Z' },
      { name: 'SECRET_B', updatedAt: '2026-01-02T00:00:00Z' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-owner/test-repo/actions/secrets',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_test_token',
        }),
      }),
    );
  });

  it('returns error when GitHub not configured (no owner/repo)', async () => {
    delete process.env.GH_OWNER;
    delete process.env.GH_REPO;
    const result = await listGitHubSecrets();
    expect(result).toEqual({ error: 'GitHub not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns error when no GH_TOKEN', async () => {
    getConfig.mockReturnValue(null);
    const result = await listGitHubSecrets();
    expect(result).toEqual({ error: 'GitHub not configured' });
  });

  it('returns error on API failure', async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: 'Bad credentials' }, 401));
    const result = await listGitHubSecrets();
    expect(result).toEqual({ error: expect.stringContaining('401') });
  });
});

describe('deleteGitHubSecret', () => {
  it('returns success on 204', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: () => null, text: () => Promise.resolve('') });
    const result = await deleteGitHubSecret('MY_SECRET');
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-owner/test-repo/actions/secrets/MY_SECRET',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('returns error when not configured', async () => {
    delete process.env.GH_OWNER;
    expect(await deleteGitHubSecret('X')).toEqual({ error: 'GitHub not configured' });
  });
});

describe('listGitHubVariables', () => {
  it('returns mapped variables on success', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      variables: [
        { name: 'VAR_A', value: 'val-a', updated_at: '2026-03-01T00:00:00Z' },
      ],
    }));

    const result = await listGitHubVariables();
    expect(result).toEqual([
      { name: 'VAR_A', value: 'val-a', updatedAt: '2026-03-01T00:00:00Z' },
    ]);
  });

  it('returns error when not configured', async () => {
    delete process.env.GH_REPO;
    expect(await listGitHubVariables()).toEqual({ error: 'GitHub not configured' });
  });
});

describe('setGitHubVariable', () => {
  it('PATCHes existing variable first', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: () => null, text: () => Promise.resolve('') });
    const result = await setGitHubVariable('MY_VAR', 'new-value');
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-owner/test-repo/actions/variables/MY_VAR',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('falls back to POST when PATCH fails (new variable)', async () => {
    // First call (PATCH) fails, second call (POST) succeeds
    fetchMock
      .mockResolvedValueOnce(mockResponse({ message: 'Not Found' }, 404))
      .mockResolvedValueOnce({ ok: true, status: 201, json: () => null, text: () => Promise.resolve('') });

    const result = await setGitHubVariable('NEW_VAR', 'value');
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call should be POST
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });

  it('returns error when not configured', async () => {
    delete process.env.GH_OWNER;
    expect(await setGitHubVariable('X', 'Y')).toEqual({ error: 'GitHub not configured' });
  });
});

describe('deleteGitHubVariable', () => {
  it('returns success on 204', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: () => null, text: () => Promise.resolve('') });
    const result = await deleteGitHubVariable('MY_VAR');
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-owner/test-repo/actions/variables/MY_VAR',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('returns error on API failure', async () => {
    fetchMock.mockResolvedValue(mockResponse({}, 500));
    const result = await deleteGitHubVariable('MY_VAR');
    expect(result).toEqual({ error: expect.stringContaining('500') });
  });
});

describe('ghFetch internals', () => {
  it('includes correct GitHub API headers', async () => {
    fetchMock.mockResolvedValue(mockResponse({ secrets: [] }));
    await listGitHubSecrets();
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(headers.Authorization).toBe('Bearer ghp_test_token');
  });

  it('includes AbortSignal timeout', async () => {
    fetchMock.mockResolvedValue(mockResponse({ secrets: [] }));
    await listGitHubSecrets();
    const signal = fetchMock.mock.calls[0][1].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
