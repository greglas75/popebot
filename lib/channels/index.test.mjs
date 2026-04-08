import { describe, it, expect } from 'vitest';
import { getTelegramAdapter } from './index.js';
import { ChannelAdapter } from './base.js';

describe('getTelegramAdapter', () => {
  it('returns a ChannelAdapter subclass with the given token', () => {
    const adapter = getTelegramAdapter('bot-token-1');
    expect(adapter).toBeInstanceOf(ChannelAdapter);
    expect(adapter.botToken).toBe('bot-token-1');
  });

  it('returns the same instance for the same token (singleton)', () => {
    const a = getTelegramAdapter('singleton-test');
    const b = getTelegramAdapter('singleton-test');
    expect(a).toBe(b);
  });

  it('creates a new instance when token changes', () => {
    const a = getTelegramAdapter('token-old');
    const b = getTelegramAdapter('token-new');
    expect(a).not.toBe(b);
    expect(b.botToken).toBe('token-new');
  });

  it('supportsStreaming is false', () => {
    expect(getTelegramAdapter('bot-token-3').supportsStreaming).toBe(false);
  });
});
