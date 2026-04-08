import { describe, it, expect } from 'vitest';
import { getTelegramAdapter } from './index.js';

describe('getTelegramAdapter', () => {
  it('returns a TelegramAdapter instance', () => {
    const adapter = getTelegramAdapter('bot-token-1');
    expect(adapter).toBeDefined();
    expect(adapter.botToken).toBe('bot-token-1');
  });

  it('returns the same instance for the same token (singleton)', () => {
    const a = getTelegramAdapter('bot-token-2');
    const b = getTelegramAdapter('bot-token-2');
    expect(a).toBe(b);
  });

  it('creates a new instance when token changes', () => {
    const a = getTelegramAdapter('token-old');
    const b = getTelegramAdapter('token-new');
    expect(a).not.toBe(b);
    expect(b.botToken).toBe('token-new');
  });

  it('returns supportsStreaming as false', () => {
    const adapter = getTelegramAdapter('bot-token-3');
    expect(adapter.supportsStreaming).toBe(false);
  });
});
