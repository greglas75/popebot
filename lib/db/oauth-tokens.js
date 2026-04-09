import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from './index.js';
import { settings } from './schema.js';
import { encrypt, decrypt } from './crypto.js';

/**
 * Map of token type slugs to their DB key names.
 * Add new token types here as needed.
 */
const TOKEN_KEYS = {
  claudeCode: 'CLAUDE_CODE_OAUTH_TOKEN',
  codex: 'CODEX_OAUTH_TOKEN',
};

function resolveKey(tokenType) {
  const key = TOKEN_KEYS[tokenType];
  if (!key) throw new Error(`Unknown OAuth token type: ${tokenType}`);
  return key;
}

/**
 * Create a new named OAuth token.
 * @param {string} tokenType - Token type slug (e.g. 'claudeCode')
 * @param {string} name - Human-readable name
 * @param {string} rawToken - Plaintext OAuth token
 * @param {string} userId - Creator user ID
 * @returns {{ id: string, name: string, createdAt: number, lastUsedAt: null }}
 */
export function createOAuthToken(tokenType, name, rawToken, userId) {
  const dbKey = resolveKey(tokenType);
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();

  const record = {
    id,
    type: 'config_secret',
    key: dbKey,
    value: JSON.stringify({ name, token: encrypt(rawToken) }),
    createdBy: userId || null,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(settings).values(record).run();

  return { id, name, createdAt: now, lastUsedAt: null };
}

/**
 * List all OAuth tokens for a type (metadata only, no decryption).
 * @param {string} tokenType - Token type slug
 * @returns {{ id: string, name: string, createdAt: number, lastUsedAt: number|null }[]}
 */
export function listOAuthTokens(tokenType) {
  const dbKey = resolveKey(tokenType);
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'config_secret'), eq(settings.key, dbKey)))
    .all();

  return rows.map((row) => {
    try {
      const parsed = JSON.parse(row.value);
      return {
        id: row.id,
        name: parsed.name || 'Unnamed',
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
      };
    } catch {
      return {
        id: row.id,
        name: 'Invalid token',
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
      };
    }
  });
}

/**
 * Delete an OAuth token by ID.
 * @param {string} id
 */
export function deleteOAuthTokenById(id) {
  const db = getDb();
  db.delete(settings).where(eq(settings.id, id)).run();
}

/**
 * Get the next OAuth token using LRU rotation.
 * Picks the least-recently-used token, updates its lastUsedAt, returns plaintext.
 * @param {string} tokenType - Token type slug
 * @returns {string|null} Plaintext token or null if none exist
 */
export function getNextOAuthToken(tokenType) {
  const dbKey = resolveKey(tokenType);
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'config_secret'), eq(settings.key, dbKey)))
    .all();

  if (rows.length === 0) return null;

  // Filter out tokens marked as broken (if the column exists)
  const healthyRows = rows.filter((row) => {
    try {
      return !row.broken;
    } catch {
      return true;
    }
  });

  if (healthyRows.length === 0) return null;

  // Sort by lastUsedAt ASC, nulls first (never used = highest priority)
  healthyRows.sort((a, b) => {
    if (a.lastUsedAt === null && b.lastUsedAt === null) return 0;
    if (a.lastUsedAt === null) return -1;
    if (b.lastUsedAt === null) return 1;
    return a.lastUsedAt - b.lastUsedAt;
  });

  // Pick LRU token + update lastUsedAt
  // SQLite is single-writer so sequential ops are safe without explicit transaction
  const now = Date.now();
  const picked = healthyRows[0];
  db.update(settings)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(settings.id, picked.id))
    .run();

  // Decrypt and return the token
  try {
    const parsed = JSON.parse(picked.value);
    if (!parsed.token) {
      console.error(`[OAuth] Token ${picked.id} has invalid format (missing token field) — delete and re-add it`);
      return null;
    }
    return decrypt(parsed.token);
  } catch (err) {
    console.error(`[OAuth] Token ${picked.id} failed to decrypt — delete and re-add it:`, err.message);
    // Mark token as broken so it is skipped in future rotations
    try {
      db.update(settings)
        .set({ broken: true, updatedAt: Date.now() })
        .where(eq(settings.id, picked.id))
        .run();
    } catch {}
    return null;
  }
}

/**
 * Get count of OAuth tokens for a type.
 * @param {string} tokenType - Token type slug
 * @returns {number}
 */
export function getOAuthTokenCount(tokenType) {
  const dbKey = resolveKey(tokenType);
  const db = getDb();
  const rows = db
    .select({ id: settings.id })
    .from(settings)
    .where(and(eq(settings.type, 'config_secret'), eq(settings.key, dbKey)))
    .all();
  return rows.length;
}
