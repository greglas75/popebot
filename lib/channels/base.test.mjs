import { describe, it, expect } from 'vitest';
import { ChannelAdapter } from './base.js';

describe('ChannelAdapter', () => {
  const adapter = new ChannelAdapter();

  describe('receive', () => {
    it('throws "Not implemented" by default', async () => {
      await expect(adapter.receive({})).rejects.toThrow('Not implemented');
    });
  });

  describe('acknowledge', () => {
    it('is a no-op by default (does not throw)', async () => {
      await expect(adapter.acknowledge({})).resolves.toBeUndefined();
    });
  });

  describe('startProcessingIndicator', () => {
    it('returns a stop function by default', () => {
      const stop = adapter.startProcessingIndicator({});
      expect(typeof stop).toBe('function');
      // calling stop should not throw
      expect(() => stop()).not.toThrow();
    });
  });

  describe('sendResponse', () => {
    it('throws "Not implemented" by default', async () => {
      await expect(adapter.sendResponse('thread', 'text', {})).rejects.toThrow('Not implemented');
    });
  });

  describe('supportsStreaming', () => {
    it('returns false by default', () => {
      expect(adapter.supportsStreaming).toBe(false);
    });
  });
});
