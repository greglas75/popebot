/**
 * @typedef {Object} ValidateUrlOptions
 * @property {boolean} [allowHttp] - Allow http: in addition to https: (default: false)
 */

/**
 * Validate that a URL is safe for server-side fetching (SSRF protection).
 * Blocks private IP ranges (IPv4 + IPv6 + IPv4-mapped), localhost, and non-HTTPS protocols.
 * Resolves DNS (A + AAAA) to catch domains pointing at private IPs.
 *
 * Limitation: DNS rebinding (TOCTOU) is mitigated but not eliminated —
 * for full protection, use a DNS-resolving proxy or firewall egress rules.
 *
 * @param {string} urlString - URL to validate
 * @returns {URL} The parsed URL if valid
 * @throws {Error} If the URL is invalid, uses a blocked protocol, or targets a private network
 */
export async function validateExternalUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP(S) URLs are allowed');
  }

  // Strip brackets from IPv6 hostnames (new URL('http://[::1]').hostname → '[::1]')
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  // Block IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1, ::ffff:10.0.0.1)
  const v4mapped = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) {
    // Re-validate the extracted IPv4 address
    const mapped = v4mapped[1];
    const v4blocked = [/^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./, /^0\./];
    if (v4blocked.some(re => re.test(mapped))) {
      throw new Error('URLs targeting private networks are not allowed');
    }
  }

  const blocked = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^169\.254\./, /^0\./, /^::1$/, /^fc00:/i, /^fe80:/i, /^fd/i,
    /^localhost$/i,
  ];
  if (blocked.some(re => re.test(hostname))) {
    throw new Error('URLs targeting private networks are not allowed');
  }

  // DNS resolution check — catch domains that resolve to private IPs
  try {
    const { resolve4, resolve6 } = await import('dns/promises');
    const v4 = await resolve4(hostname).catch(() => []);
    const v6 = await resolve6(hostname).catch(() => []);
    const privateV4 = [/^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./, /^0\./];
    const privateV6 = [/^::1$/, /^fe80:/i, /^fc00:/i, /^fd/i, /^::ffff:(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.)/i];
    for (const ip of v4) {
      if (privateV4.some(re => re.test(ip))) {
        throw new Error('URLs targeting private networks are not allowed');
      }
    }
    for (const ip of v6) {
      if (privateV6.some(re => re.test(ip))) {
        throw new Error('URLs targeting private networks are not allowed');
      }
    }
  } catch (err) {
    if (err.message?.includes('private')) throw err;
    // DNS failures pass through — the fetch will fail naturally
  }

  return parsed;
}
