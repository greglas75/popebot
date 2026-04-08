import { encrypt, decrypt } from '../db/crypto.js';

/**
 * Create an encrypted OAuth state parameter.
 *
 * Packs secret name, client credentials, token URL, secret type, and return
 * path into an AES-256-GCM encrypted base64url string. This travels through
 * the OAuth redirect and back to our callback untouched.
 */
export function createOAuthState({ secretName, clientId, clientSecret, tokenUrl, secretType, returnPath }) {
  const payload = JSON.stringify({ secretName, clientId, clientSecret, tokenUrl, secretType, returnPath });
  const encrypted = encrypt(payload);
  return Buffer.from(encrypted).toString('base64url');
}

/**
 * Decrypt an OAuth state parameter back to the original payload.
 */
export function parseOAuthState(stateString) {
  const encrypted = Buffer.from(stateString, 'base64url').toString();
  const decrypted = decrypt(encrypted);
  return JSON.parse(decrypted);
}

/**
 * Exchange an authorization code for tokens.
 *
 * POSTs to the provider's token endpoint with grant_type=authorization_code.
 * Returns the full JSON response (access_token, refresh_token, expires_in, etc.).
 */
export async function exchangeCodeForToken({ code, clientId, clientSecret, tokenUrl, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.error_description || data.error || 'Token exchange failed';
    throw new Error(errorMsg);
  }

  if (!data.access_token) {
    throw new Error('No access_token in token response');
  }

  return data;
}

/**
 * Refresh an OAuth2 access token using a refresh token.
 *
 * POSTs to the provider's token endpoint with grant_type=refresh_token.
 * Returns the full JSON response (new access_token, possibly new refresh_token, etc.).
 */
export async function refreshOAuthToken({ refreshToken, clientId, clientSecret, tokenUrl }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.error_description || data.error || 'Token refresh failed';
    throw new Error(errorMsg);
  }

  if (!data.access_token) {
    throw new Error('No access_token in refresh response');
  }

  return data;
}
