import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The module has a top-level setInterval — mock timers before importing
vi.useFakeTimers();

const { rateLimit, rateLimitResponse } = await import('./rate-limit.js');

describe('rateLimit', () => {
  beforeEach(() => {
    vi.setSystemTime(1000000);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('allowing requests within limit', () => {
    it('allows the first request for a key', () => {
      const result = rateLimit('test-allow-first', 5, 60000);
      expect(result).toEqual({ allowed: true });
    });

    it('allows requests up to the max count', () => {
      const key = 'test-allow-max';
      for (let i = 0; i < 4; i++) {
        expect(rateLimit(key, 5, 60000).allowed).toBe(true);
      }
      // 5th request should still be allowed
      expect(rateLimit(key, 5, 60000)).toEqual({ allowed: true });
    });
  });

  describe('blocking requests over limit', () => {
    it('blocks the request exceeding max', () => {
      const key = 'test-block-exceed';
      for (let i = 0; i < 3; i++) {
        rateLimit(key, 3, 60000);
      }
      const result = rateLimit(key, 3, 60000);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('returns retryAfter in seconds based on oldest entry', () => {
      const key = 'test-retry-after';
      vi.setSystemTime(1000000);
      rateLimit(key, 2, 10000); // entry at t=1000000

      vi.setSystemTime(1002000); // 2s later
      rateLimit(key, 2, 10000); // entry at t=1002000

      vi.setSystemTime(1003000); // 3s later
      const result = rateLimit(key, 2, 10000);
      // oldest entry at 1000000 + window 10000 = 1010000, now = 1003000
      // retryAfter = ceil((1010000 - 1003000) / 1000) = 7
      expect(result).toEqual({ allowed: false, retryAfter: 7 });
    });
  });

  describe('sliding window expiry', () => {
    it('allows requests after old entries expire from the window', () => {
      const key = 'test-window-expiry';
      vi.setSystemTime(1000000);
      rateLimit(key, 1, 5000); // fill the limit

      vi.setSystemTime(1000000 + 5001); // past the window
      const result = rateLimit(key, 1, 5000);
      expect(result).toEqual({ allowed: true });
    });
  });

  describe('independent keys', () => {
    it('tracks separate keys independently', () => {
      rateLimit('key-a', 1, 60000);
      const resultA = rateLimit('key-a', 1, 60000);
      const resultB = rateLimit('key-b', 1, 60000);
      expect(resultA.allowed).toBe(false);
      expect(resultB.allowed).toBe(true);
    });
  });

  describe('large window (>120s) cleanup correctness', () => {
    it('does not evict entries prematurely for windows larger than 120s', () => {
      const key = 'test-large-window';
      vi.setSystemTime(1000000);
      rateLimit(key, 2, 300000); // 5-minute window
      vi.setSystemTime(1001000);
      rateLimit(key, 2, 300000); // fill to max

      // Advance past 120s but within 300s window
      vi.setSystemTime(1000000 + 130000); // 130s later
      // Trigger cleanup interval (60s)
      vi.advanceTimersByTime(60000);

      // Both entries should still be in window — request should be blocked
      const result = rateLimit(key, 2, 300000);
      expect(result.allowed).toBe(false);
    });
  });
});

describe('rateLimitResponse', () => {
  it('returns null when request is allowed', () => {
    const result = rateLimitResponse({ allowed: true });
    expect(result).toBeNull();
  });

  it('returns a 429 Response with Retry-After header when blocked', () => {
    const result = rateLimitResponse({ allowed: false, retryAfter: 42 });
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(429);
    expect(result.headers.get('Retry-After')).toBe('42');
  });

  it('returns JSON body with error message when blocked', async () => {
    const result = rateLimitResponse({ allowed: false, retryAfter: 10 });
    const body = await result.json();
    expect(body).toEqual({ error: 'Too many requests' });
  });
});
