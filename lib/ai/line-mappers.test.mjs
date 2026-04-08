import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mapLine,
  mapClaudeCodeLine,
  mapPiLine,
  mapGeminiLine,
  mapKimiLine,
  mapCodexLine,
  mapOpenCodeLine,
} from './line-mappers.js';

// Suppress console.warn noise from mapLine JSON parse failures
let warnSpy;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// mapLine (core dispatcher)
// ─────────────────────────────────────────────────────────────────────────────

describe('mapLine', () => {
  it('parses valid JSON and delegates to the default mapper (mapClaudeCodeLine)', () => {
    const line = JSON.stringify({ type: 'result', result: 'All done.' });
    const events = mapLine(line);
    expect(events).toEqual([{ type: 'text', text: 'All done.' }]);
  });

  it('wraps non-JSON lines as plain text events', () => {
    const events = mapLine('NO_CHANGES');
    expect(events).toEqual([{ type: 'text', text: '\nNO_CHANGES\n' }]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('wraps AGENT_FAILED non-JSON line as plain text', () => {
    const events = mapLine('AGENT_FAILED');
    expect(events).toEqual([{ type: 'text', text: '\nAGENT_FAILED\n' }]);
  });

  it('returns empty array when mapper returns skip events', () => {
    const line = JSON.stringify({ type: 'system', message: 'init' });
    const events = mapLine(line);
    expect(events).toHaveLength(0);
  });

  it('returns unknown when mapper returns empty array', () => {
    const parsed = { type: 'totally_unknown_type' };
    const line = JSON.stringify(parsed);
    const events = mapLine(line);
    expect(events).toEqual([{ type: 'unknown', raw: parsed }]);
  });

  it('returns unknown when all events have empty text field', () => {
    const fakeMapper = () => [{ type: 'text', text: '' }];
    const line = JSON.stringify({ anything: true });
    const events = mapLine(line, fakeMapper);
    expect(events).toEqual([{ type: 'unknown', raw: { anything: true } }]);
  });

  it('returns unknown for empty tool-call (no toolName)', () => {
    const fakeMapper = () => [{ type: 'tool-call', toolCallId: 'x', toolName: '' }];
    const line = JSON.stringify({});
    const events = mapLine(line, fakeMapper);
    expect(events).toEqual([{ type: 'unknown', raw: {} }]);
  });

  it('returns unknown for empty tool-result (no toolCallId)', () => {
    const fakeMapper = () => [{ type: 'tool-result', toolCallId: '', result: 'stuff' }];
    const line = JSON.stringify({});
    const events = mapLine(line, fakeMapper);
    expect(events).toEqual([{ type: 'unknown', raw: {} }]);
  });

  it('passes through valid events from a custom mapper', () => {
    const customMapper = () => [{ type: 'text', text: 'hello from custom' }];
    const events = mapLine(JSON.stringify({}), customMapper);
    expect(events).toEqual([{ type: 'text', text: 'hello from custom' }]);
  });

  it('suppresses entire result when any event is skip', () => {
    const customMapper = () => [{ type: 'skip' }, { type: 'text', text: 'visible' }];
    const events = mapLine(JSON.stringify({}), customMapper);
    expect(events).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapClaudeCodeLine
// ─────────────────────────────────────────────────────────────────────────────

describe('mapClaudeCodeLine', () => {
  it('skips system events', () => {
    const events = mapClaudeCodeLine({ type: 'system', message: { content: 'init' } });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('skips rate_limit_event with status allowed', () => {
    const events = mapClaudeCodeLine({
      type: 'rate_limit_event',
      rate_limit_info: { status: 'allowed' },
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('surfaces rate_limit_event with status blocked as text with timestamp', () => {
    const resetsAt = 1700000000;
    const events = mapClaudeCodeLine({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'blocked',
        rateLimitType: 'token',
        resetsAt,
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('text');
    expect(events[0].text).toContain('Rate limited (token)');
    const expectedDate = new Date(resetsAt * 1000).toLocaleString();
    expect(events[0].text).toContain(expectedDate);
  });

  it('surfaces rate_limit_event with missing resetsAt gracefully', () => {
    const events = mapClaudeCodeLine({
      type: 'rate_limit_event',
      rate_limit_info: { status: 'blocked', rateLimitType: 'request' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('text');
    expect(events[0].text).toContain('Rate limited (request)');
  });

  it('extracts text from assistant message', () => {
    const events = mapClaudeCodeLine({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    });
    expect(events).toEqual([{ type: 'text', text: 'Hello, world!' }]);
  });

  it('extracts tool_use from assistant message', () => {
    const events = mapClaudeCodeLine({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool_01',
            name: 'read_file',
            input: { path: '/tmp/test.js' },
          },
        ],
      },
    });
    expect(events).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'tool_01',
        toolName: 'read_file',
        args: { path: '/tmp/test.js' },
      },
    ]);
  });

  it('extracts both text and tool_use from a single assistant message', () => {
    const events = mapClaudeCodeLine({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me read that file.' },
          { type: 'tool_use', id: 'tu_1', name: 'read_file', input: { path: 'x.js' } },
        ],
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'text', text: 'Let me read that file.' });
    expect(events[1]).toEqual({
      type: 'tool-call',
      toolCallId: 'tu_1',
      toolName: 'read_file',
      args: { path: 'x.js' },
    });
  });

  it('skips assistant message with only thinking blocks', () => {
    const events = mapClaudeCodeLine({
      type: 'assistant',
      message: {
        content: [{ type: 'thinking', text: 'hmm...' }],
      },
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('skips assistant message with empty content array', () => {
    const events = mapClaudeCodeLine({
      type: 'assistant',
      message: { content: [] },
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('ignores text blocks with empty text in assistant message', () => {
    const events = mapClaudeCodeLine({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: '' }],
      },
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts tool_result from user message with stdout priority', () => {
    const events = mapClaudeCodeLine({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'fallback' }],
      },
      tool_use_result: { stdout: 'stdout output' },
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'tu_1', result: 'stdout output' },
    ]);
  });

  it('extracts tool_result with string content when no stdout', () => {
    const events = mapClaudeCodeLine({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu_2', content: 'string content' }],
      },
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'tu_2', result: 'string content' },
    ]);
  });

  it('extracts tool_result with array content when no stdout', () => {
    const events = mapClaudeCodeLine({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_3',
            content: [{ text: 'part1' }, { text: 'part2' }],
          },
        ],
      },
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'tu_3', result: 'part1part2' },
    ]);
  });

  it('handles tool_result with array content containing missing text fields', () => {
    const events = mapClaudeCodeLine({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_4',
            content: [{ text: 'a' }, {}, { text: 'b' }],
          },
        ],
      },
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'tu_4', result: 'ab' },
    ]);
  });

  it('JSON-stringifies tool_result content that is neither string nor array', () => {
    const events = mapClaudeCodeLine({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_5',
            content: { nested: true },
          },
        ],
      },
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'tu_5', result: '{"nested":true}' },
    ]);
  });

  it('skips user message without tool_result blocks', () => {
    const events = mapClaudeCodeLine({
      type: 'user',
      message: {
        content: [{ type: 'text', text: 'a user prompt' }],
      },
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('skips user message with empty content', () => {
    const events = mapClaudeCodeLine({
      type: 'user',
      message: { content: [] },
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts result type as text', () => {
    const events = mapClaudeCodeLine({
      type: 'result',
      result: 'Task completed successfully.',
    });
    expect(events).toEqual([{ type: 'text', text: 'Task completed successfully.' }]);
  });

  it('returns empty array for result type with no result field', () => {
    const events = mapClaudeCodeLine({ type: 'result' });
    expect(events).toHaveLength(0);
  });

  it('returns empty array for assistant type with missing message', () => {
    const events = mapClaudeCodeLine({ type: 'assistant' });
    expect(events).toHaveLength(0);
  });

  it('returns empty array for unknown type', () => {
    const events = mapClaudeCodeLine({ type: 'something_else' });
    expect(events).toHaveLength(0);
  });

  it('extracts multiple tool_results from a single user message', () => {
    const events = mapClaudeCodeLine({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'a', content: 'result A' },
          { type: 'tool_result', tool_use_id: 'b', content: 'result B' },
        ],
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'tool-result', toolCallId: 'a', result: 'result A' });
    expect(events[1]).toEqual({ type: 'tool-result', toolCallId: 'b', result: 'result B' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapPiLine
// ─────────────────────────────────────────────────────────────────────────────

describe('mapPiLine', () => {
  it('extracts text_delta from message_update', () => {
    const events = mapPiLine({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'Hello' },
    });
    expect(events).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('skips text_delta with empty delta', () => {
    const events = mapPiLine({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '' },
    });
    expect(events).toHaveLength(0);
  });

  it('skips text_delta with null delta', () => {
    const events = mapPiLine({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: null },
    });
    expect(events).toHaveLength(0);
  });

  it('extracts tool call from toolcall_end', () => {
    const events = mapPiLine({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_end',
        toolCall: { id: 'tc_1', name: 'bash', arguments: { command: 'ls' } },
      },
    });
    expect(events).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'tc_1',
        toolName: 'bash',
        args: { command: 'ls' },
      },
    ]);
  });

  it('defaults tool call args to empty object when missing', () => {
    const events = mapPiLine({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'toolcall_end',
        toolCall: { id: 'tc_2', name: 'read' },
      },
    });
    expect(events[0].args).toEqual({});
  });

  it('extracts tool execution result from tool_execution_end', () => {
    const events = mapPiLine({
      type: 'tool_execution_end',
      toolCallId: 'tc_1',
      result: {
        content: [{ text: 'file contents here' }],
      },
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'tc_1', result: 'file contents here' },
    ]);
  });

  it('handles tool_execution_end with multiple content blocks', () => {
    const events = mapPiLine({
      type: 'tool_execution_end',
      toolCallId: 'tc_3',
      result: {
        content: [{ text: 'part1' }, { text: 'part2' }],
      },
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'tc_3', result: 'part1part2' },
    ]);
  });

  it('handles tool_execution_end with empty result', () => {
    const events = mapPiLine({
      type: 'tool_execution_end',
      toolCallId: 'tc_4',
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'tc_4', result: '' },
    ]);
  });

  it('handles tool_execution_end with missing toolCallId', () => {
    const events = mapPiLine({
      type: 'tool_execution_end',
      result: { content: [{ text: 'output' }] },
    });
    expect(events[0].toolCallId).toBe('');
  });

  it('extracts final summary text from agent_end', () => {
    const events = mapPiLine({
      type: 'agent_end',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Do something' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Done!' }] },
      ],
    });
    expect(events).toEqual([{ type: 'text', text: 'Done!' }]);
  });

  it('picks the last assistant message from agent_end', () => {
    const events = mapPiLine({
      type: 'agent_end',
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'First' }] },
        { role: 'user', content: [{ type: 'text', text: 'More' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Final answer' }] },
      ],
    });
    expect(events).toEqual([{ type: 'text', text: 'Final answer' }]);
  });

  it('returns empty for agent_end with no assistant messages', () => {
    const events = mapPiLine({
      type: 'agent_end',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    });
    expect(events).toHaveLength(0);
  });

  it('returns empty for agent_end with assistant message having no text blocks', () => {
    const events = mapPiLine({
      type: 'agent_end',
      messages: [
        { role: 'assistant', content: [{ type: 'image', url: 'x.png' }] },
      ],
    });
    expect(events).toHaveLength(0);
  });

  it('concatenates multiple text blocks in agent_end last assistant message', () => {
    const events = mapPiLine({
      type: 'agent_end',
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Part A. ' },
            { type: 'text', text: 'Part B.' },
          ],
        },
      ],
    });
    expect(events).toEqual([{ type: 'text', text: 'Part A. Part B.' }]);
  });

  it('returns empty for session events', () => {
    const events = mapPiLine({ type: 'session' });
    expect(events).toHaveLength(0);
  });

  it('returns empty for turn_start events', () => {
    const events = mapPiLine({ type: 'turn_start' });
    expect(events).toHaveLength(0);
  });

  it('returns empty for message_update without assistantMessageEvent', () => {
    const events = mapPiLine({ type: 'message_update' });
    expect(events).toHaveLength(0);
  });

  it('skips text_start and text_end subtypes', () => {
    expect(mapPiLine({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_start' },
    })).toHaveLength(0);
    expect(mapPiLine({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_end' },
    })).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapGeminiLine
// ─────────────────────────────────────────────────────────────────────────────

describe('mapGeminiLine', () => {
  it('skips init events', () => {
    const events = mapGeminiLine({ type: 'init', session_id: 'abc', model: 'gemini-2.5-flash' });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('skips user message echo', () => {
    const events = mapGeminiLine({ type: 'message', role: 'user', content: 'my prompt' });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts assistant text from string content', () => {
    const events = mapGeminiLine({ type: 'message', role: 'assistant', content: 'Here is the answer.' });
    expect(events).toEqual([{ type: 'text', text: 'Here is the answer.' }]);
  });

  it('extracts assistant text from object content with text field', () => {
    const events = mapGeminiLine({ type: 'message', role: 'assistant', content: { text: 'Object content' } });
    expect(events).toEqual([{ type: 'text', text: 'Object content' }]);
  });

  it('returns empty for assistant message with empty content', () => {
    const events = mapGeminiLine({ type: 'message', role: 'assistant', content: '' });
    expect(events).toHaveLength(0);
  });

  it('returns empty for assistant message with null content', () => {
    const events = mapGeminiLine({ type: 'message', role: 'assistant', content: null });
    expect(events).toHaveLength(0);
  });

  it('extracts tool_use event with tool_id and tool_name', () => {
    const events = mapGeminiLine({
      type: 'tool_use',
      tool_id: 'gt_1',
      tool_name: 'shell',
      parameters: { command: 'cat foo.txt' },
    });
    expect(events).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'gt_1',
        toolName: 'shell',
        args: { command: 'cat foo.txt' },
      },
    ]);
  });

  it('falls back to id and name fields for tool_use', () => {
    const events = mapGeminiLine({
      type: 'tool_use',
      id: 'alt_id',
      name: 'alt_name',
      input: { x: 1 },
    });
    expect(events).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'alt_id',
        toolName: 'alt_name',
        args: { x: 1 },
      },
    ]);
  });

  it('defaults tool_use fields to empty strings and object', () => {
    const events = mapGeminiLine({ type: 'tool_use' });
    expect(events).toEqual([
      { type: 'tool-call', toolCallId: '', toolName: '', args: {} },
    ]);
  });

  it('extracts tool_result with string output', () => {
    const events = mapGeminiLine({
      type: 'tool_result',
      tool_id: 'gt_1',
      status: 'success',
      output: 'file contents',
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'gt_1', result: 'file contents' },
    ]);
  });

  it('JSON-stringifies non-string tool_result output', () => {
    const events = mapGeminiLine({
      type: 'tool_result',
      tool_id: 'gt_2',
      output: { data: [1, 2, 3] },
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'gt_2', result: '{"data":[1,2,3]}' },
    ]);
  });

  it('handles tool_result with undefined output', () => {
    const events = mapGeminiLine({ type: 'tool_result', tool_id: 'gt_3' });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'gt_3', result: '' },
    ]);
  });

  it('falls back to id field for tool_result', () => {
    const events = mapGeminiLine({ type: 'tool_result', id: 'alt_id', output: 'ok' });
    expect(events[0].toolCallId).toBe('alt_id');
  });

  it('extracts result event with stats as completion summary', () => {
    const events = mapGeminiLine({
      type: 'result',
      status: 'success',
      stats: { total_tokens: 5000, tool_calls: 3, duration_ms: 12500 },
    });
    expect(events).toEqual([
      { type: 'text', text: 'Completed (5000 tokens, 3 tool calls, 12.5s)' },
    ]);
  });

  it('handles result event with zero stats', () => {
    const events = mapGeminiLine({
      type: 'result',
      stats: { total_tokens: 0, tool_calls: 0, duration_ms: 0 },
    });
    expect(events).toEqual([
      { type: 'text', text: 'Completed (0 tokens, 0 tool calls, 0.0s)' },
    ]);
  });

  it('skips result event without stats', () => {
    const events = mapGeminiLine({ type: 'result', status: 'success' });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts error event with message field', () => {
    const events = mapGeminiLine({ type: 'error', message: 'Something broke' });
    expect(events).toEqual([{ type: 'text', text: 'Error: Something broke' }]);
  });

  it('extracts error event with error field', () => {
    const events = mapGeminiLine({ type: 'error', error: 'rate limit' });
    expect(events).toEqual([{ type: 'text', text: 'Error: rate limit' }]);
  });

  it('JSON-stringifies error when no message or error field', () => {
    const events = mapGeminiLine({ type: 'error', code: 500 });
    expect(events).toEqual([
      { type: 'text', text: 'Error: {"type":"error","code":500}' },
    ]);
  });

  it('returns empty for unknown Gemini event types', () => {
    const events = mapGeminiLine({ type: 'heartbeat' });
    expect(events).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapKimiLine
// ─────────────────────────────────────────────────────────────────────────────

describe('mapKimiLine', () => {
  it('extracts text from assistant with string content', () => {
    const events = mapKimiLine({ role: 'assistant', content: 'Hello!' });
    expect(events).toEqual([{ type: 'text', text: 'Hello!' }]);
  });

  it('extracts text from assistant with array of string blocks', () => {
    const events = mapKimiLine({ role: 'assistant', content: ['part1', 'part2'] });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'text', text: 'part1' });
    expect(events[1]).toEqual({ type: 'text', text: 'part2' });
  });

  it('extracts text from assistant with array of typed blocks', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: [{ type: 'text', text: 'typed block' }],
    });
    expect(events).toEqual([{ type: 'text', text: 'typed block' }]);
  });

  it('skips empty string blocks in content array', () => {
    const events = mapKimiLine({ role: 'assistant', content: ['', 'visible'] });
    expect(events).toEqual([{ type: 'text', text: 'visible' }]);
  });

  it('skips typed blocks with empty text', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts tool calls in OpenAI function calling format with JSON string args', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          type: 'function',
          id: 'call_1',
          function: { name: 'read_file', arguments: '{"path":"x.js"}' },
        },
      ],
    });
    expect(events).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'read_file',
        args: { path: 'x.js' },
      },
    ]);
  });

  it('handles tool call with already-parsed arguments object', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          type: 'function',
          id: 'call_2',
          function: { name: 'write', arguments: { content: 'hi' } },
        },
      ],
    });
    expect(events[0].args).toEqual({ content: 'hi' });
  });

  it('handles tool call with invalid JSON arguments string', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          type: 'function',
          id: 'call_3',
          function: { name: 'bad_args', arguments: '{broken' },
        },
      ],
    });
    expect(events[0].args).toEqual({});
  });

  it('extracts text and tool calls from same assistant message', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: 'Thinking...',
      tool_calls: [
        {
          type: 'function',
          id: 'c1',
          function: { name: 'bash', arguments: '{"cmd":"ls"}' },
        },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'text', text: 'Thinking...' });
    expect(events[1].type).toBe('tool-call');
    expect(events[1].toolName).toBe('bash');
  });

  it('skips assistant message with empty content and no tool calls', () => {
    const events = mapKimiLine({ role: 'assistant', content: '' });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('skips assistant message with null content and no tool calls', () => {
    const events = mapKimiLine({ role: 'assistant', content: null });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts tool result from tool role with string content', () => {
    const events = mapKimiLine({
      role: 'tool',
      content: 'tool output here',
      tool_call_id: 'call_1',
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'call_1', result: 'tool output here' },
    ]);
  });

  it('extracts tool result with array of typed blocks', () => {
    const events = mapKimiLine({
      role: 'tool',
      content: [{ text: 'a' }, { text: 'b' }],
      tool_call_id: 'call_2',
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'call_2', result: 'ab' },
    ]);
  });

  it('extracts tool result with array of raw strings', () => {
    const events = mapKimiLine({
      role: 'tool',
      content: ['line1', 'line2'],
      tool_call_id: 'call_x',
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'call_x', result: 'line1line2' },
    ]);
  });

  it('JSON-stringifies non-string non-array tool result content', () => {
    const events = mapKimiLine({
      role: 'tool',
      content: { key: 'value' },
      tool_call_id: 'call_3',
    });
    expect(events).toEqual([
      { type: 'tool-result', toolCallId: 'call_3', result: '{"key":"value"}' },
    ]);
  });

  it('handles missing tool_call_id in tool role', () => {
    const events = mapKimiLine({ role: 'tool', content: 'output' });
    expect(events[0].toolCallId).toBe('');
  });

  it('returns empty for unknown role', () => {
    const events = mapKimiLine({ role: 'system', content: 'system prompt' });
    expect(events).toHaveLength(0);
  });

  it('ignores non-function type tool calls', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: 'text',
      tool_calls: [{ type: 'other', id: 'x' }],
    });
    expect(events).toEqual([{ type: 'text', text: 'text' }]);
  });

  it('handles tool call with missing function field', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: '',
      tool_calls: [{ type: 'function', id: 'no_fn' }],
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('handles tool call with missing id', () => {
    const events = mapKimiLine({
      role: 'assistant',
      content: '',
      tool_calls: [
        { type: 'function', function: { name: 'test', arguments: '{}' } },
      ],
    });
    expect(events[0].toolCallId).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapCodexLine
// ─────────────────────────────────────────────────────────────────────────────

describe('mapCodexLine', () => {
  it('skips thread.started events', () => {
    const events = mapCodexLine({ type: 'thread.started', thread_id: 'th_1' });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('skips turn.started events', () => {
    const events = mapCodexLine({ type: 'turn.started' });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('skips item.started events', () => {
    const events = mapCodexLine({ type: 'item.started', item: { type: 'command_execution' } });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts agent_message text from item.completed', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'I fixed the bug.' },
    });
    expect(events).toEqual([{ type: 'text', text: 'I fixed the bug.' }]);
  });

  it('extracts command_execution as tool-call + tool-result', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: {
        type: 'command_execution',
        id: 'cmd_1',
        command: 'npm test',
        aggregated_output: 'All tests passed.',
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'tool-call',
      toolCallId: 'cmd_1',
      toolName: 'command',
      args: { command: 'npm test' },
    });
    expect(events[1]).toEqual({
      type: 'tool-result',
      toolCallId: 'cmd_1',
      result: 'All tests passed.',
    });
  });

  it('extracts command_execution without aggregated_output (call only)', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'command_execution', id: 'cmd_2', command: 'ls' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool-call');
  });

  it('falls back to input field for command_execution command', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'command_execution', id: 'cmd_3', input: 'echo hello' },
    });
    expect(events[0].args).toEqual({ command: 'echo hello' });
  });

  it('JSON-stringifies non-string aggregated_output', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: {
        type: 'command_execution',
        id: 'cmd_4',
        command: 'jq .',
        aggregated_output: { key: 'val' },
      },
    });
    expect(events[1].result).toBe('{"key":"val"}');
  });

  it('extracts mcp_tool_call as tool-call + tool-result', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: {
        type: 'mcp_tool_call',
        id: 'mcp_1',
        server: 'codesift',
        tool: 'search_text',
        arguments: { query: 'foo' },
        result: { content: [{ text: 'found it' }] },
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'tool-call',
      toolCallId: 'mcp_1',
      toolName: 'codesift:search_text',
      args: { query: 'foo' },
    });
    expect(events[1]).toEqual({
      type: 'tool-result',
      toolCallId: 'mcp_1',
      result: 'found it',
    });
  });

  it('handles mcp_tool_call without result', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: {
        type: 'mcp_tool_call',
        id: 'mcp_2',
        server: 'fs',
        tool: 'read',
        arguments: {},
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool-call');
  });

  it('defaults mcp_tool_call server to mcp when missing', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'mcp_tool_call', id: 'mcp_3', tool: 'search' },
    });
    expect(events[0].toolName).toBe('mcp:search');
  });

  it('defaults mcp_tool_call tool to unknown when missing', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'mcp_tool_call', id: 'mcp_4', server: 'x' },
    });
    expect(events[0].toolName).toBe('x:unknown');
  });

  it('JSON-stringifies mcp result when content array is missing', () => {
    const resultObj = { status: 'ok' };
    const events = mapCodexLine({
      type: 'item.completed',
      item: {
        type: 'mcp_tool_call',
        id: 'mcp_5',
        server: 's',
        tool: 't',
        result: resultObj,
      },
    });
    expect(events[1].result).toBe(JSON.stringify(resultObj));
  });

  it('falls back to JSON.stringify when mcp content text is all empty', () => {
    const resultObj = { content: [{}] };
    const events = mapCodexLine({
      type: 'item.completed',
      item: {
        type: 'mcp_tool_call',
        id: 'mcp_6',
        server: 's',
        tool: 't',
        result: resultObj,
      },
    });
    expect(events).toHaveLength(2);
    // joined text is '' (falsy) so falls through to JSON.stringify
    expect(events[1].result).toBe(JSON.stringify(resultObj));
  });

  it('extracts file_change as tool-call', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'file_change', id: 'fc_1', file: 'src/app.js', action: 'create' },
    });
    expect(events).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'fc_1',
        toolName: 'file_change',
        args: { file: 'src/app.js', action: 'create' },
      },
    ]);
  });

  it('defaults file_change action to edit', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'file_change', id: 'fc_2', file: 'x.js' },
    });
    expect(events[0].args.action).toBe('edit');
  });

  it('falls back to path field for file_change file', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'file_change', id: 'fc_3', path: 'y.js' },
    });
    expect(events[0].args.file).toBe('y.js');
  });

  it('extracts turn.completed with usage stats', () => {
    const events = mapCodexLine({
      type: 'turn.completed',
      usage: { input_tokens: 1500, output_tokens: 300 },
    });
    expect(events).toEqual([
      { type: 'text', text: 'Completed (1500 input, 300 output tokens)' },
    ]);
  });

  it('skips turn.completed without usage', () => {
    const events = mapCodexLine({ type: 'turn.completed' });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts turn.failed with error message', () => {
    const events = mapCodexLine({
      type: 'turn.failed',
      error: { message: 'Context limit exceeded' },
    });
    expect(events).toEqual([{ type: 'text', text: 'Error: Context limit exceeded' }]);
  });

  it('JSON-stringifies turn.failed error without message', () => {
    const events = mapCodexLine({
      type: 'turn.failed',
      error: { code: 'TIMEOUT' },
    });
    expect(events).toEqual([{ type: 'text', text: 'Error: {"code":"TIMEOUT"}' }]);
  });

  it('handles turn.failed with no error object', () => {
    const parsed = { type: 'turn.failed' };
    const events = mapCodexLine(parsed);
    expect(events[0].type).toBe('text');
    expect(events[0].text).toContain('Error:');
  });

  it('extracts error event with message', () => {
    const events = mapCodexLine({ type: 'error', message: 'bad request' });
    expect(events).toEqual([{ type: 'text', text: 'Error: bad request' }]);
  });

  it('extracts error event with error field fallback', () => {
    const events = mapCodexLine({ type: 'error', error: 'server error' });
    expect(events).toEqual([{ type: 'text', text: 'Error: server error' }]);
  });

  it('returns empty for item.completed with no item', () => {
    const events = mapCodexLine({ type: 'item.completed' });
    expect(events).toHaveLength(0);
  });

  it('returns empty for item.completed with unknown item type', () => {
    const events = mapCodexLine({
      type: 'item.completed',
      item: { type: 'unknown_item' },
    });
    expect(events).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapOpenCodeLine
// ─────────────────────────────────────────────────────────────────────────────

describe('mapOpenCodeLine', () => {
  it('extracts text from text event', () => {
    const events = mapOpenCodeLine({ type: 'text', part: { text: 'Hello from OpenCode' } });
    expect(events).toEqual([{ type: 'text', text: 'Hello from OpenCode' }]);
  });

  it('returns empty for text event with empty text', () => {
    const events = mapOpenCodeLine({ type: 'text', part: { text: '' } });
    expect(events).toHaveLength(0);
  });

  it('returns empty for text event with missing part', () => {
    const events = mapOpenCodeLine({ type: 'text' });
    expect(events).toHaveLength(0);
  });

  it('returns empty for text event with null part.text', () => {
    const events = mapOpenCodeLine({ type: 'text', part: { text: null } });
    expect(events).toHaveLength(0);
  });

  it('extracts tool_use as tool-call + tool-result when completed', () => {
    const events = mapOpenCodeLine({
      type: 'tool_use',
      part: {
        callID: 'oc_1',
        tool: 'bash',
        state: {
          input: { command: 'ls -la' },
          status: 'completed',
          output: 'total 42\nfile1.js\nfile2.js',
        },
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'tool-call',
      toolCallId: 'oc_1',
      toolName: 'bash',
      args: { command: 'ls -la' },
    });
    expect(events[1]).toEqual({
      type: 'tool-result',
      toolCallId: 'oc_1',
      result: 'total 42\nfile1.js\nfile2.js',
    });
  });

  it('extracts tool_use call only when status is not completed', () => {
    const events = mapOpenCodeLine({
      type: 'tool_use',
      part: {
        callID: 'oc_2',
        tool: 'read',
        state: { input: { path: 'x.js' }, status: 'running' },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool-call');
  });

  it('falls back to id field for callID', () => {
    const events = mapOpenCodeLine({
      type: 'tool_use',
      part: { id: 'oc_3', tool: 'write', state: { input: {} } },
    });
    expect(events[0].toolCallId).toBe('oc_3');
  });

  it('defaults callID and toolName to empty strings when missing', () => {
    const events = mapOpenCodeLine({
      type: 'tool_use',
      part: { state: { input: { a: 1 } } },
    });
    expect(events[0].toolCallId).toBe('');
    expect(events[0].toolName).toBe('');
  });

  it('defaults input to empty object when state has no input', () => {
    const events = mapOpenCodeLine({
      type: 'tool_use',
      part: { callID: 'oc_4', tool: 'x', state: {} },
    });
    expect(events[0].args).toEqual({});
  });

  it('defaults state to empty object when part has no state', () => {
    const events = mapOpenCodeLine({
      type: 'tool_use',
      part: { callID: 'oc_5', tool: 'y' },
    });
    expect(events[0].args).toEqual({});
  });

  it('JSON-stringifies non-string output', () => {
    const events = mapOpenCodeLine({
      type: 'tool_use',
      part: {
        callID: 'oc_6',
        tool: 'bash',
        state: { input: {}, status: 'completed', output: { lines: ['a', 'b'] } },
      },
    });
    expect(events[1].result).toBe('{"lines":["a","b"]}');
  });

  it('skips step_start events', () => {
    const events = mapOpenCodeLine({ type: 'step_start', part: { snapshot: {} } });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('skips step_finish events', () => {
    const events = mapOpenCodeLine({
      type: 'step_finish',
      part: { cost: 0.01, tokens: 500, reason: 'done' },
    });
    expect(events).toEqual([{ type: 'skip' }]);
  });

  it('extracts error event with message', () => {
    const events = mapOpenCodeLine({ type: 'error', message: 'connection failed' });
    expect(events).toEqual([{ type: 'text', text: 'Error: connection failed' }]);
  });

  it('extracts error event with error field fallback', () => {
    const events = mapOpenCodeLine({ type: 'error', error: 'timeout' });
    expect(events).toEqual([{ type: 'text', text: 'Error: timeout' }]);
  });

  it('JSON-stringifies error when no message or error field', () => {
    const parsed = { type: 'error', code: 'ERR_CONN' };
    const events = mapOpenCodeLine(parsed);
    expect(events).toEqual([
      { type: 'text', text: 'Error: {"type":"error","code":"ERR_CONN"}' },
    ]);
  });

  it('returns empty for tool_use with missing part', () => {
    const events = mapOpenCodeLine({ type: 'tool_use' });
    expect(events).toHaveLength(0);
  });

  it('returns empty for unknown event type', () => {
    const events = mapOpenCodeLine({ type: 'heartbeat' });
    expect(events).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: mapLine + each mapper
// ─────────────────────────────────────────────────────────────────────────────

describe('mapLine integration', () => {
  it('uses mapClaudeCodeLine as default mapper', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hi' }] },
    });
    const events = mapLine(line);
    expect(events).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('routes through mapPiLine when passed as mapper', () => {
    const line = JSON.stringify({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'pi says hi' },
    });
    const events = mapLine(line, mapPiLine);
    expect(events).toEqual([{ type: 'text', text: 'pi says hi' }]);
  });

  it('routes through mapGeminiLine when passed as mapper (skip -> empty)', () => {
    const line = JSON.stringify({ type: 'init', session_id: 'g1' });
    const events = mapLine(line, mapGeminiLine);
    expect(events).toHaveLength(0);
  });

  it('routes through mapKimiLine when passed as mapper', () => {
    const line = JSON.stringify({ role: 'assistant', content: 'kimi text' });
    const events = mapLine(line, mapKimiLine);
    expect(events).toEqual([{ type: 'text', text: 'kimi text' }]);
  });

  it('routes through mapCodexLine when passed as mapper (skip -> empty)', () => {
    const line = JSON.stringify({ type: 'thread.started', thread_id: 'th_x' });
    const events = mapLine(line, mapCodexLine);
    expect(events).toHaveLength(0);
  });

  it('routes through mapOpenCodeLine when passed as mapper', () => {
    const line = JSON.stringify({ type: 'text', part: { text: 'opencode output' } });
    const events = mapLine(line, mapOpenCodeLine);
    expect(events).toEqual([{ type: 'text', text: 'opencode output' }]);
  });

  it('emits unknown for mapper returning empty events (not skip)', () => {
    const line = JSON.stringify({ type: 'totally_alien' });
    const events = mapLine(line, mapPiLine);
    expect(events).toEqual([{ type: 'unknown', raw: { type: 'totally_alien' } }]);
  });
});
