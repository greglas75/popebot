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
      expect(rateLimit('allow-first', 5, 60000)).toEqual({ allowed: true });
    });

    it('allows requests up to the max count', () => {
      for (let i = 0; i < 4; i++) {
        expect(rateLimit('allow-max', 5, 60000).allowed).toBe(true);
      }
      expect(rateLimit('allow-max', 5, 60000)).toEqual({ allowed: true });
    });
  });

  describe('blocking requests over limit', () => {
    it('blocks the request exceeding max', () => {
      for (let i = 0; i < 3; i++) rateLimit('block-exceed', 3, 60000);
      const result = rateLimit('block-exceed', 3, 60000);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('returns retryAfter in seconds based on oldest entry', () => {
      vi.setSystemTime(1000000);
      rateLimit('retry-after', 2, 10000);
      vi.setSystemTime(1002000);
      rateLimit('retry-after', 2, 10000);
      vi.setSystemTime(1003000);
      // oldest=1000000, window=10000, now=1003000 → ceil((1010000-1003000)/1000)=7
      expect(rateLimit('retry-after', 2, 10000)).toEqual({ allowed: false, retryAfter: 7 });
    });

    it('retryAfter is at least 1 when entry is about to expire', () => {
      vi.setSystemTime(1000000);
      rateLimit('retry-near-expiry', 1, 1000);
      vi.setSystemTime(1000999); // 999ms later, 1ms before expiry
      // oldest=1000000, window=1000, now=1000999 → ceil((1001000-1000999)/1000)=ceil(0.001)=1
      expect(rateLimit('retry-near-expiry', 1, 1000)).toEqual({ allowed: false, retryAfter: 1 });
    });
  });

  describe('sliding window expiry', () => {
    it('allows requests after old entries expire (past window by 1ms)', () => {
      vi.setSystemTime(1000000);
      rateLimit('expiry-past', 1, 5000);
      vi.setSystemTime(1005001); // 5001ms later
      expect(rateLimit('expiry-past', 1, 5000)).toEqual({ allowed: true });
    });

    it('removes entry at exact boundary (< not <=)', () => {
      vi.setSystemTime(1000000);
      rateLimit('expiry-exact', 1, 5000);
      vi.setSystemTime(1005000); // exactly 5000ms later — 5000 < 5000 is false → expired
      expect(rateLimit('expiry-exact', 1, 5000)).toEqual({ allowed: true });
    });

    it('keeps entry 1ms before boundary', () => {
      vi.setSystemTime(1000000);
      rateLimit('expiry-before', 1, 5000);
      vi.setSystemTime(1004999); // 4999ms later — 4999 < 5000 is true → still in window
      expect(rateLimit('expiry-before', 1, 5000).allowed).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('blocks immediately when maxRequests is 0', () => {
      const result = rateLimit('max-zero', 0, 60000);
      // 0 >= 0 is true → blocked
      expect(result.allowed).toBe(false);
    });

    it('allows unlimited requests when windowMs is 0 (all entries instantly expire)', () => {
      for (let i = 0; i < 10; i++) {
        rateLimit('window-zero', 1, 0);
      }
      // All previous entries expired (now - t < 0 is always false)
      expect(rateLimit('window-zero', 1, 0)).toEqual({ allowed: true });
    });

    it('tracks separate keys independently', () => {
      rateLimit('independent-a', 1, 60000);
      expect(rateLimit('independent-a', 1, 60000).allowed).toBe(false);
      expect(rateLimit('independent-b', 1, 60000).allowed).toBe(true);
    });
  });

  describe('cleanup interval', () => {
    it('removes stale entries when cleanup fires', () => {
      vi.setSystemTime(1000000);
      rateLimit('cleanup-basic', 2, 5000);
      rateLimit('cleanup-basic', 2, 5000);

      // Move past window + trigger cleanup
      vi.setSystemTime(1000000 + 6000);
      vi.advanceTimersByTime(60000);

      // After cleanup, entries should be gone
      expect(rateLimit('cleanup-basic', 2, 5000)).toEqual({ allowed: true });
    });

    it('preserves entries within window during cleanup', () => {
      vi.setSystemTime(1000000);
      rateLimit('cleanup-keep', 2, 120000); // 120s window
      vi.setSystemTime(1010000); // 10s later
      rateLimit('cleanup-keep', 2, 120000);

      // advanceTimersByTime also advances system clock: 1010000 + 60000 = 1070000
      vi.advanceTimersByTime(60000); // trigger cleanup

      // At cleanup: now=1070000
      // Entry 1: 1070000-1000000=70000 < 120000 → kept
      // Entry 2: 1070000-1010000=60000 < 120000 → kept
      // Both kept → should block
      expect(rateLimit('cleanup-keep', 2, 120000).allowed).toBe(false);
    });

    it('does not prematurely evict entries for large windows (>120s)', () => {
      vi.setSystemTime(1000000);
      rateLimit('large-window', 2, 300000); // 5-minute window
      vi.setSystemTime(1001000);
      rateLimit('large-window', 2, 300000);

      // Advance past 120s but within 300s
      vi.setSystemTime(1000000 + 130000);
      vi.advanceTimersByTime(60000); // trigger cleanup

      // Entries are 130s old, within 300s window — should still block
      expect(rateLimit('large-window', 2, 300000).allowed).toBe(false);
    });

    it('cleans up across multiple keys', () => {
      vi.setSystemTime(1000000);
      rateLimit('multi-a', 1, 5000);
      rateLimit('multi-b', 1, 5000);

      vi.setSystemTime(1000000 + 6000);
      vi.advanceTimersByTime(60000);

      expect(rateLimit('multi-a', 1, 5000).allowed).toBe(true);
      expect(rateLimit('multi-b', 1, 5000).allowed).toBe(true);
    });
  });
});

describe('rateLimitResponse', () => {
  it('returns null when request is allowed', () => {
    expect(rateLimitResponse({ allowed: true })).toBeNull();
  });

  it('returns 429 Response with Retry-After header when blocked', () => {
    const result = rateLimitResponse({ allowed: false, retryAfter: 42 });
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(429);
    expect(result.headers.get('Retry-After')).toBe('42');
  });

  it('returns JSON body with error message', async () => {
    const body = await rateLimitResponse({ allowed: false, retryAfter: 10 }).json();
    expect(body).toEqual({ error: 'Too many requests' });
  });

  it('sets Retry-After to "undefined" string when retryAfter missing (production bug)', () => {
    // Documents actual behavior: String(undefined) = "undefined"
    const result = rateLimitResponse({ allowed: false });
    expect(result.headers.get('Retry-After')).toBe('undefined');
  });
});
