import { createCipheriv, createDecipheriv, createHmac, randomBytes, pbkdf2Sync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const STATIC_SALT = 'thepopebot-config-v1';
const ITERATIONS = 100_000;

let _key = null;
let _staticKey = null;

/**
 * Derive a per-installation salt from AUTH_SECRET using HMAC.
 * Deterministic (no file I/O) — unique per AUTH_SECRET value,
 * survives container rebuilds, and differs between installations.
 */
function getDerivedSalt() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET environment variable is required for encryption');
  return createHmac('sha256', secret).update('thepopebot-derived-salt-v1').digest();
}

/**
 * Derive a 256-bit key from AUTH_SECRET using PBKDF2.
 * Uses a per-installation HMAC-derived salt (unique per AUTH_SECRET).
 * Cached for the lifetime of the process.
 */
function getKey() {
  if (_key) return _key;
  _key = pbkdf2Sync(process.env.AUTH_SECRET, getDerivedSalt(), ITERATIONS, KEY_LENGTH, 'sha256');
  return _key;
}

/** Key derived with the original static salt — for backward-compatible decryption. */
function getStaticKey() {
  if (_staticKey) return _staticKey;
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET environment variable is required for encryption');
  _staticKey = pbkdf2Sync(secret, STATIC_SALT, ITERATIONS, KEY_LENGTH, 'sha256');
  return _staticKey;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * @param {string} plaintext
 * @returns {string} JSON string { iv, ciphertext, tag }
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
}

function decryptWithKey(encryptedJson, key) {
  const { iv, ciphertext, tag } = JSON.parse(encryptedJson);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Decrypt an AES-256-GCM encrypted JSON string.
 * Tries the current (HMAC-derived) key first, then falls back to the
 * static salt key for data encrypted before the migration.
 * @param {string} encryptedJson - JSON string from encrypt()
 * @returns {string} plaintext
 */
export function decrypt(encryptedJson) {
  try {
    return decryptWithKey(encryptedJson, getKey());
  } catch {
    // Fallback: try the original static-salt key (pre-migration data)
    return decryptWithKey(encryptedJson, getStaticKey());
  }
}
