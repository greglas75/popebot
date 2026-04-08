import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock exec via promisify interception
const mockExecAsync = vi.fn();
vi.mock('child_process', () => ({ exec: vi.fn() }));
vi.mock('util', () => ({ promisify: () => mockExecAsync }));
vi.mock('./tools/create-agent-job.js', () => ({ createAgentJob: vi.fn() }));
vi.mock('./url-validation.js', () => ({ validateExternalUrl: vi.fn() }));

const { executeAction } = await import('./actions.js');
const { createAgentJob } = await import('./tools/create-agent-job.js');
const { validateExternalUrl } = await import('./url-validation.js');

let fetchMock;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('executeAction', () => {
  describe('type: command', () => {
    it('executes shell command and returns trimmed stdout', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '  hello world  \n', stderr: '' });
      expect(await executeAction({ type: 'command', command: 'echo hello' }, { cwd: '/tmp' }))
        .toBe('hello world');
      expect(mockExecAsync).toHaveBeenCalledWith('echo hello', { cwd: '/tmp', timeout: 30_000 });
    });

    it('returns stderr when stdout is empty', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: 'warning' });
      expect(await executeAction({ type: 'command', command: 'lint' })).toBe('warning');
    });

    it('propagates exec errors', async () => {
      mockExecAsync.mockRejectedValue(new Error('command not found'));
      await expect(executeAction({ type: 'command', command: 'bad' })).rejects.toThrow('command not found');
    });
  });

  describe('type: webhook', () => {
    it('sends POST with vars as JSON body', async () => {
      validateExternalUrl.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue({ status: 200 });
      const result = await executeAction({
        type: 'webhook', url: 'https://hook.example.com/notify', vars: { key: 'value' },
      });
      expect(result).toBe('POST https://hook.example.com/notify → 200');
      expect(validateExternalUrl).toHaveBeenCalledWith('https://hook.example.com/notify');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ key: 'value' });
    });

    it('includes opts.data in POST body', async () => {
      validateExternalUrl.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue({ status: 201 });
      await executeAction(
        { type: 'webhook', url: 'https://x.com', vars: { a: 1 } },
        { data: { payload: 'test' } },
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ a: 1, data: { payload: 'test' } });
    });

    it('sends GET without body', async () => {
      validateExternalUrl.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue({ status: 200 });
      await executeAction({ type: 'webhook', url: 'https://x.com', method: 'GET' });
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });

    it('includes custom headers alongside Content-Type', async () => {
      validateExternalUrl.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue({ status: 200 });
      await executeAction({ type: 'webhook', url: 'https://x.com', headers: { 'X-Custom': 'val' } });
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['X-Custom']).toBe('val');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('returns status string for error HTTP codes (no throw)', async () => {
      validateExternalUrl.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue({ status: 500 });
      // Production does NOT throw on non-2xx — returns status as string
      const result = await executeAction({ type: 'webhook', url: 'https://x.com' });
      expect(result).toBe('POST https://x.com → 500');
    });

    it('propagates URL validation errors (SSRF protection)', async () => {
      validateExternalUrl.mockRejectedValue(new Error('SSRF blocked'));
      await expect(executeAction({ type: 'webhook', url: 'http://169.254.169.254' }))
        .rejects.toThrow('SSRF blocked');
    });

    it('defaults method to POST', async () => {
      validateExternalUrl.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue({ status: 200 });
      await executeAction({ type: 'webhook', url: 'https://x.com' });
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });
  });

  describe('type: agent (default)', () => {
    it('creates agent job and returns description', async () => {
      createAgentJob.mockResolvedValue({ agent_job_id: 'abc123', title: 'Fix the bug' });
      const result = await executeAction({ job: 'Fix the bug in auth' });
      expect(result).toBe('agent-job abc123 — Fix the bug');
      expect(createAgentJob).toHaveBeenCalledWith('Fix the bug in auth', {});
    });

    it('passes llm_model and agent_backend options', async () => {
      createAgentJob.mockResolvedValue({ agent_job_id: 'x', title: 'Task' });
      await executeAction({ job: 'task', llm_model: 'claude-opus-4-6', agent_backend: 'claude-code' });
      expect(createAgentJob).toHaveBeenCalledWith('task', {
        llmModel: 'claude-opus-4-6', agentBackend: 'claude-code',
      });
    });

    it('defaults to agent type when type is not specified', async () => {
      createAgentJob.mockResolvedValue({ agent_job_id: 'y', title: 'Auto' });
      expect(await executeAction({ job: 'do something' })).toContain('agent-job');
    });

    it('propagates createAgentJob errors', async () => {
      createAgentJob.mockRejectedValue(new Error('GitHub API down'));
      await expect(executeAction({ job: 'fail' })).rejects.toThrow('GitHub API down');
    });
  });
});
