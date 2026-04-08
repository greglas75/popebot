/**
 * Validate that a URL is safe for server-side fetching (SSRF protection).
 * Blocks private IP ranges, localhost, and non-HTTP(S) protocols.
 *
 * Limitation: checks hostname strings only — does not resolve DNS.
 * A domain that resolves to 127.0.0.1 (DNS rebinding) bypasses this check.
 * For full protection, use a DNS-resolving proxy or firewall egress rules.
 *
 * @param {string} urlString
 * @returns {URL} The parsed URL if valid
 * @throws {Error} If the URL is invalid or targets a private network
 */
export function validateExternalUrl(urlString) {
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

  return parsed;
}
