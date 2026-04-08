import { describe, it, expect } from 'vitest';
import { ChannelAdapter } from './base.js';

describe('ChannelAdapter (base contract)', () => {
  const adapter = new ChannelAdapter();

  it('receive() throws "Not implemented" by default', async () => {
    await expect(adapter.receive({})).rejects.toThrow('Not implemented');
  });

  it('acknowledge() is a no-op (does not throw)', async () => {
    await expect(adapter.acknowledge({})).resolves.toBeUndefined();
  });

  it('startProcessingIndicator() returns a callable stop function', () => {
    const stop = adapter.startProcessingIndicator({});
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });

  it('sendResponse() throws "Not implemented" by default', async () => {
    await expect(adapter.sendResponse('thread', 'text', {})).rejects.toThrow('Not implemented');
  });

  it('supportsStreaming is false by default', () => {
    expect(adapter.supportsStreaming).toBe(false);
  });
});
