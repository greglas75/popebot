import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = 'thepopebot-config-v1';
const ITERATIONS = 100_000;

let _key = null;

/**
 * Derive a 256-bit key from AUTH_SECRET using PBKDF2.
 * Cached for the lifetime of the process.
 */
function getKey() {
  if (_key) return _key;
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is required for encryption');
  }
  _key = pbkdf2Sync(secret, SALT, ITERATIONS, KEY_LENGTH, 'sha256');
  return _key;
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

/**
 * Decrypt an AES-256-GCM encrypted JSON string.
 * @param {string} encryptedJson - JSON string from encrypt()
 * @returns {string} plaintext
 */
export function decrypt(encryptedJson) {
  const key = getKey();
  const { iv, ciphertext, tag } = JSON.parse(encryptedJson);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
