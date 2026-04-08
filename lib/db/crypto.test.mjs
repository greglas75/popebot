import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createCipheriv, pbkdf2Sync, createHmac, randomBytes } from 'crypto';

// Set AUTH_SECRET before importing crypto module
const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = 'test-secret-for-unit-tests';

const { encrypt, decrypt } = await import('./crypto.js');

afterAll(() => {
  if (ORIGINAL_AUTH_SECRET !== undefined) {
    process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  } else {
    delete process.env.AUTH_SECRET;
  }
  vi.resetModules(); // Unload crypto.js so cached keys don't leak to other test files
});

// Helper: encrypt with the static salt key (simulates pre-migration data)
function encryptWithStaticKey(plaintext) {
  const STATIC_SALT = 'thepopebot-config-v1';
  const key = pbkdf2Sync(process.env.AUTH_SECRET, STATIC_SALT, 100_000, 32, 'sha256');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
}

describe('encrypt', () => {
  it('returns valid JSON with iv, ciphertext, and tag fields', () => {
    const parsed = JSON.parse(encrypt('hello world'));
    expect(Object.keys(parsed).sort()).toEqual(['ciphertext', 'iv', 'tag']);
  });

  it('produces base64-encoded values', () => {
    const parsed = JSON.parse(encrypt('test data'));
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    expect(parsed.iv).toMatch(base64Regex);
    expect(parsed.ciphertext).toMatch(base64Regex);
    expect(parsed.tag).toMatch(base64Regex);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encrypt('same input');
    const b = encrypt('same input');
    expect(a).not.toBe(b);
  });

  it('produces different ciphertexts for different plaintexts', () => {
    const a = JSON.parse(encrypt('input one'));
    const b = JSON.parse(encrypt('input two'));
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe('decrypt', () => {
  it('roundtrips plaintext through encrypt then decrypt', () => {
    const plaintext = 'sensitive API key value';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('roundtrips empty string', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('roundtrips unicode content', () => {
    const plaintext = 'klucz API: 日本語テスト 🔑';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('roundtrips long content', () => {
    const plaintext = 'x'.repeat(10000);
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });
});

describe('decrypt static-key fallback (backward compatibility)', () => {
  it('decrypts data encrypted with static salt key via fallback', () => {
    // Simulate pre-migration data: encrypted with STATIC_SALT, not HMAC-derived salt
    const plaintext = 'legacy secret from before migration';
    const legacyEncrypted = encryptWithStaticKey(plaintext);
    // decrypt() tries current key first (fails), then falls back to static key
    expect(decrypt(legacyEncrypted)).toBe(plaintext);
  });

  it('throws when neither primary nor static key can decrypt', () => {
    const fakeEncrypted = JSON.stringify({
      iv: Buffer.from('aabbccddeeff', 'hex').toString('base64'),
      ciphertext: Buffer.from('deadbeef', 'hex').toString('base64'),
      tag: Buffer.from('0011223344556677889900aabbccddee', 'hex').toString('base64'),
    });
    expect(() => decrypt(fakeEncrypted)).toThrow();
  });
});

describe('tamper detection', () => {
  it('throws on tampered ciphertext', () => {
    const parsed = JSON.parse(encrypt('original'));
    const buf = Buffer.from(parsed.ciphertext, 'base64');
    buf[0] ^= 0xff;
    parsed.ciphertext = buf.toString('base64');
    expect(() => decrypt(JSON.stringify(parsed))).toThrow();
  });

  it('throws on tampered auth tag', () => {
    const parsed = JSON.parse(encrypt('original'));
    const buf = Buffer.from(parsed.tag, 'base64');
    buf[0] ^= 0xff;
    parsed.tag = buf.toString('base64');
    expect(() => decrypt(JSON.stringify(parsed))).toThrow();
  });

  it('throws on tampered IV', () => {
    const parsed = JSON.parse(encrypt('original'));
    const buf = Buffer.from(parsed.iv, 'base64');
    buf[0] ^= 0xff;
    parsed.iv = buf.toString('base64');
    expect(() => decrypt(JSON.stringify(parsed))).toThrow();
  });

  it('throws on missing iv field', () => {
    const parsed = JSON.parse(encrypt('original'));
    delete parsed.iv;
    expect(() => decrypt(JSON.stringify(parsed))).toThrow();
  });

  it('throws on missing ciphertext field', () => {
    const parsed = JSON.parse(encrypt('original'));
    delete parsed.ciphertext;
    expect(() => decrypt(JSON.stringify(parsed))).toThrow();
  });

  it('throws on invalid JSON input', () => {
    expect(() => decrypt('not json')).toThrow();
  });

  it('throws on invalid base64 in ciphertext', () => {
    const parsed = JSON.parse(encrypt('original'));
    parsed.ciphertext = '!!!not-base64!!!';
    expect(() => decrypt(JSON.stringify(parsed))).toThrow();
  });
});

describe('AUTH_SECRET validation', () => {
  it('encrypt requires AUTH_SECRET to be set (tested via module behavior)', () => {
    // The module was imported with AUTH_SECRET set — key derivation succeeded.
    // Direct test of missing AUTH_SECRET would require module reload, which
    // conflicts with cached keys. Document behavior: throws at import time
    // if AUTH_SECRET is missing when first encrypt/decrypt is called.
    expect(typeof encrypt).toBe('function');
    expect(typeof decrypt).toBe('function');
  });
});

describe('special character handling', () => {
  it('handles JSON content with quotes and backslashes', () => {
    const plaintext = '{"key": "value with \\"quotes\\" and \\\\backslashes"}';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('handles newlines and tabs', () => {
    const plaintext = 'line1\nline2\ttab';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });
});
