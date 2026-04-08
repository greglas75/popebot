/**
 * In-memory sliding-window rate limiter.
 * Stores request timestamps per key in a Map with periodic cleanup.
 */

const windows = new Map();

// Cleanup stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entries] of windows) {
    const fresh = entries.filter(t => now - t < 120_000);
    if (fresh.length === 0) windows.delete(key);
    else windows.set(key, fresh);
  }
}, 60_000).unref();

/**
 * Check whether a request is allowed under the rate limit.
 * @param {string} key - Unique identifier (e.g. "login:user@example.com")
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @param {number} windowMs - Sliding window duration in milliseconds
 * @returns {{ allowed: boolean, retryAfter?: number }}
 */
export function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const entries = (windows.get(key) || []).filter(t => now - t < windowMs);
  if (entries.length >= maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((entries[0] + windowMs - now) / 1000) };
  }
  entries.push(now);
  windows.set(key, entries);
  return { allowed: true };
}

/**
 * Return a 429 Response if the rate limit check failed, or null if allowed.
 * @param {{ allowed: boolean, retryAfter?: number }} result
 * @returns {Response|null}
 */
export function rateLimitResponse(result) {
  if (!result.allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
    );
  }
  return null;
}
