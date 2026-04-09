import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { state, mockEncrypt, mockDecrypt, mockCreateOAuthToken } = vi.hoisted(() => ({
  state: {},
  mockEncrypt: vi.fn((val) => `ENC(${val})`),
  mockDecrypt: vi.fn((val) => {
    const m = val.match(/^ENC\((.+)\)$/s);
    if (m) return m[1];
    throw new Error('decrypt failed');
  }),
  mockCreateOAuthToken: vi.fn(),
}));

vi.mock('./index.js', () => ({ getDb: () => state.db }));
vi.mock('./crypto.js', () => ({ encrypt: mockEncrypt, decrypt: mockDecrypt }));
vi.mock('./oauth-tokens.js', () => ({ createOAuthToken: mockCreateOAuthToken }));

// ─── Import module under test ────────────────────────────────────────────────
const {
  getConfigValue, setConfigValue, deleteConfigValue,
  getConfigSecret, setConfigSecret, deleteConfigSecret,
  getSecretStatus,
  getCustomProviders, getCustomProvider, setCustomProvider, deleteCustomProvider,
  setAgentJobSecret, getAgentJobSecretOAuthCredentials, deleteAgentJobSecret,
  listAgentJobSecrets, getAllAgentJobSecrets, getAgentJobSecretRaw,
  migrateEnvToDb,
} = await import('./config.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CREATE_TABLE = `CREATE TABLE settings (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, key TEXT NOT NULL,
  value TEXT NOT NULL, created_by TEXT, last_used_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
)`;

/** Insert a raw row into the settings table, bypassing production code. */
function seed(overrides = {}) {
  state.sqlite.prepare(
    'INSERT INTO settings (id, type, key, value, created_by, last_used_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    overrides.id || 'seed-id',
    overrides.type || 'config',
    overrides.key || 'TEST_KEY',
    overrides.value || JSON.stringify('test-value'),
    overrides.createdBy ?? null,
    overrides.lastUsedAt ?? null,
    overrides.createdAt ?? 1000,
    overrides.updatedAt ?? 2000,
  );
}

function allRows() {
  return state.sqlite.prepare('SELECT * FROM settings').all();
}

function rowCount() {
  return state.sqlite.prepare('SELECT COUNT(*) as c FROM settings').get().c;
}

/** Simulates the DB value for an encrypted secret (mirrors setConfigSecret's encoding). */
function encVal(plaintext) {
  return JSON.stringify(`ENC(${plaintext})`);
}

/** Simulates the DB value for a custom provider (mirrors setCustomProvider's encoding). */
function providerVal(config) {
  return JSON.stringify(`ENC(${JSON.stringify(config)})`);
}

// ─── Setup / teardown ────────────────────────────────────────────────────────
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1700000000000);

  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_TABLE);
  state.sqlite = sqlite;
  state.db = drizzle(sqlite, { schema });

  mockEncrypt.mockImplementation((val) => `ENC(${val})`);
  mockDecrypt.mockImplementation((val) => {
    const m = val.match(/^ENC\((.+)\)$/s);
    if (m) return m[1];
    throw new Error('decrypt failed');
  });

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  state.sqlite.close();
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Plain config (type: 'config')
// ═══════════════════════════════════════════════════════════════════════════════

describe('getConfigValue', () => {
  it('returns parsed JSON string value when key exists', () => {
    seed({ type: 'config', key: 'LLM_PROVIDER', value: JSON.stringify('anthropic') });
    expect(getConfigValue('LLM_PROVIDER')).toBe('anthropic');
  });

  it('returns parsed JSON object value when key exists', () => {
    seed({ type: 'config', key: 'SETTINGS', value: JSON.stringify({ a: 1, b: true }) });
    expect(getConfigValue('SETTINGS')).toEqual({ a: 1, b: true });
  });

  it('returns null when key does not exist', () => {
    expect(getConfigValue('NONEXISTENT')).toBeNull();
  });

  it('does not return rows of a different type', () => {
    seed({ type: 'config_secret', key: 'MY_KEY', value: JSON.stringify('secret') });
    expect(getConfigValue('MY_KEY')).toBeNull();
  });
});

describe('setConfigValue', () => {
  it('inserts a new config row with correct fields', () => {
    setConfigValue('LLM_MODEL', 'opus', 'user-1');
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('config');
    expect(rows[0].key).toBe('LLM_MODEL');
    expect(rows[0].value).toBe(JSON.stringify('opus'));
    expect(rows[0].created_by).toBe('user-1');
    expect(rows[0].created_at).toBe(1700000000000);
    expect(rows[0].updated_at).toBe(1700000000000);
  });

  it('replaces an existing value on upsert with refreshed timestamp', () => {
    seed({ type: 'config', key: 'LLM_MODEL', value: JSON.stringify('sonnet'), updatedAt: 1000 });
    setConfigValue('LLM_MODEL', 'opus');
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].value)).toBe('opus');
    expect(rows[0].updated_at).toBe(1700000000000);
  });

  it('stores null createdBy when userId is omitted', () => {
    setConfigValue('KEY', 'val');
    expect(allRows()[0].created_by).toBeNull();
  });
});

describe('deleteConfigValue', () => {
  it('removes the config entry', () => {
    seed({ type: 'config', key: 'TO_DELETE' });
    deleteConfigValue('TO_DELETE');
    expect(rowCount()).toBe(0);
  });

  it('is a no-op when key does not exist', () => {
    deleteConfigValue('NONEXISTENT');
    expect(rowCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Encrypted secrets (type: 'config_secret')
// ═══════════════════════════════════════════════════════════════════════════════

describe('getConfigSecret', () => {
  it('returns the decrypted value when key exists', () => {
    // Stored as JSON.stringify(encrypted) where encrypted = encrypt(value)
    seed({ type: 'config_secret', key: 'API_KEY', value: encVal('sk-123') });
    expect(getConfigSecret('API_KEY')).toBe('sk-123');
  });

  it('returns null when key does not exist', () => {
    expect(getConfigSecret('MISSING')).toBeNull();
  });

  it('returns null when decryption fails', () => {
    // Value that won't match ENC(...) pattern → decrypt throws
    seed({ type: 'config_secret', key: 'BAD', value: JSON.stringify('corrupted-data') });
    expect(getConfigSecret('BAD')).toBeNull();
  });

  it('calls decrypt with the JSON-parsed stored value', () => {
    seed({ type: 'config_secret', key: 'K', value: encVal('val') });
    getConfigSecret('K');
    expect(mockDecrypt).toHaveBeenCalledWith('ENC(val)');
  });
});

describe('setConfigSecret', () => {
  it('stores the encrypted value with correct type', () => {
    setConfigSecret('GH_TOKEN', 'ghp_abc', 'user-1');
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('config_secret');
    expect(rows[0].key).toBe('GH_TOKEN');
    // value = JSON.stringify(encrypt('ghp_abc')) = JSON.stringify('ENC(ghp_abc)')
    expect(JSON.parse(rows[0].value)).toBe('ENC(ghp_abc)');
    expect(mockEncrypt).toHaveBeenCalledWith('ghp_abc');
  });

  it('replaces existing secret on upsert with refreshed timestamp', () => {
    seed({ id: 'old', type: 'config_secret', key: 'TOKEN', value: encVal('old-val'), updatedAt: 1000 });
    setConfigSecret('TOKEN', 'new-val');
    expect(rowCount()).toBe(1);
    expect(JSON.parse(allRows()[0].value)).toBe('ENC(new-val)');
    expect(allRows()[0].updated_at).toBe(1700000000000);
  });
});

describe('deleteConfigSecret', () => {
  it('removes the secret entry without affecting other types', () => {
    seed({ id: 'secret', type: 'config_secret', key: 'SHARED_KEY' });
    seed({ id: 'config', type: 'config', key: 'SHARED_KEY', value: JSON.stringify('keep-me') });
    deleteConfigSecret('SHARED_KEY');
    expect(rowCount()).toBe(1);
    expect(allRows()[0].type).toBe('config');
  });
});

describe('getSecretStatus', () => {
  it('returns isSet true with updatedAt for existing secrets', () => {
    seed({ type: 'config_secret', key: 'GH_TOKEN', updatedAt: 5000 });
    const result = getSecretStatus(['GH_TOKEN']);
    expect(result).toEqual([{ key: 'GH_TOKEN', isSet: true, updatedAt: 5000 }]);
  });

  it('preserves updatedAt of 0 without coercing to null', () => {
    seed({ type: 'config_secret', key: 'ZERO_TS', updatedAt: 0 });
    const result = getSecretStatus(['ZERO_TS']);
    expect(result[0].updatedAt).toBe(0);
    expect(result[0].isSet).toBe(true);
  });

  it('returns isSet false with null updatedAt for missing secrets', () => {
    const result = getSecretStatus(['MISSING_KEY']);
    expect(result).toEqual([{ key: 'MISSING_KEY', isSet: false, updatedAt: null }]);
  });

  it('handles a mix of set and unset keys', () => {
    seed({ id: 's1', type: 'config_secret', key: 'KEY_A', updatedAt: 3000 });
    const result = getSecretStatus(['KEY_A', 'KEY_B']);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ key: 'KEY_A', isSet: true, updatedAt: 3000 });
    expect(result[1]).toEqual({ key: 'KEY_B', isSet: false, updatedAt: null });
  });

  it('returns empty array for empty keys input', () => {
    expect(getSecretStatus([])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Custom LLM providers (type: 'llm_provider')
// ═══════════════════════════════════════════════════════════════════════════════

describe('getCustomProviders', () => {
  it('returns all providers with hasApiKey flag and masked keys', () => {
    const config = { name: 'Together', baseUrl: 'https://api.together.xyz', apiKey: 'sk-tog', models: ['llama-3'] };
    seed({ type: 'llm_provider', key: 'together', value: providerVal(config) });

    const result = getCustomProviders();
    expect(result).toEqual([{
      key: 'together',
      name: 'Together',
      baseUrl: 'https://api.together.xyz',
      models: ['llama-3'],
      hasApiKey: true,
    }]);
  });

  it('returns hasApiKey false when apiKey is empty', () => {
    const config = { name: 'Local', baseUrl: 'http://localhost:11434', apiKey: '', models: [] };
    seed({ type: 'llm_provider', key: 'local', value: providerVal(config) });
    expect(getCustomProviders()[0].hasApiKey).toBe(false);
  });

  it('defaults to empty models array when models field is missing', () => {
    const config = { name: 'NoModels', baseUrl: 'http://test.com', apiKey: 'k' };
    seed({ type: 'llm_provider', key: 'nm', value: providerVal(config) });
    expect(getCustomProviders()[0].models).toEqual([]);
  });

  it('returns empty array when no providers exist', () => {
    expect(getCustomProviders()).toEqual([]);
  });

  it('skips corrupted provider rows without crashing', () => {
    seed({ id: 'good', type: 'llm_provider', key: 'good', value: providerVal({ name: 'Good', baseUrl: 'http://ok.com', apiKey: 'k', models: [] }) });
    seed({ id: 'bad', type: 'llm_provider', key: 'bad', value: JSON.stringify('corrupted-not-enc') });
    const result = getCustomProviders();
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('good');
  });
});

describe('getCustomProvider', () => {
  it('returns full provider config with API key', () => {
    const config = { name: 'Together', baseUrl: 'https://api.together.xyz', apiKey: 'sk-tog', models: ['llama-3'] };
    seed({ type: 'llm_provider', key: 'together', value: providerVal(config) });

    const result = getCustomProvider('together');
    expect(result).toEqual(config);
  });

  it('returns null when provider key does not exist', () => {
    expect(getCustomProvider('nonexistent')).toBeNull();
  });

  it('defaults to empty models array when field is missing', () => {
    const config = { name: 'Bare', baseUrl: 'http://test.com', apiKey: 'k' };
    seed({ type: 'llm_provider', key: 'bare', value: providerVal(config) });
    expect(getCustomProvider('bare').models).toEqual([]);
  });

  it('returns null when provider data is corrupted', () => {
    seed({ type: 'llm_provider', key: 'bad', value: JSON.stringify('corrupted') });
    expect(getCustomProvider('bad')).toBeNull();
  });
});

describe('setCustomProvider', () => {
  it('stores encrypted provider config and replaces existing', () => {
    seed({ id: 'old', type: 'llm_provider', key: 'prov' });
    const config = { name: 'New', baseUrl: 'http://new.com', apiKey: 'k', models: ['m'] };
    setCustomProvider('prov', config, 'user-1');

    expect(rowCount()).toBe(1);
    expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify(config));
    expect(allRows()[0].type).toBe('llm_provider');
    expect(allRows()[0].created_by).toBe('user-1');
  });
});

describe('deleteCustomProvider', () => {
  it('removes the provider entry', () => {
    seed({ type: 'llm_provider', key: 'del-me' });
    deleteCustomProvider('del-me');
    expect(rowCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Agent job secrets (type: 'agent_job_secret')
// ═══════════════════════════════════════════════════════════════════════════════

describe('setAgentJobSecret', () => {
  it('stores encrypted agent secret with correct type', () => {
    setAgentJobSecret('MY_VAR', 'my-value', 'user-1');
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('agent_job_secret');
    expect(rows[0].key).toBe('MY_VAR');
    expect(JSON.parse(rows[0].value)).toBe('ENC(my-value)');
    expect(mockEncrypt).toHaveBeenCalledWith('my-value');
  });
});

describe('getAgentJobSecretOAuthCredentials', () => {
  it('returns OAuth credentials for oauth2 type secret', () => {
    const oauthData = { type: 'oauth2', clientId: 'cid', clientSecret: 'cs', tokenUrl: 'https://auth.example.com/token' };
    seed({ type: 'agent_job_secret', key: 'OAUTH', value: encVal(JSON.stringify(oauthData)) });

    const result = getAgentJobSecretOAuthCredentials('OAUTH');
    expect(result).toEqual({ clientId: 'cid', clientSecret: 'cs', tokenUrl: 'https://auth.example.com/token' });
  });

  it('returns null when key does not exist', () => {
    expect(getAgentJobSecretOAuthCredentials('MISSING')).toBeNull();
  });

  it('returns null for non-oauth2 secrets', () => {
    seed({ type: 'agent_job_secret', key: 'PLAIN', value: encVal('just-a-string') });
    expect(getAgentJobSecretOAuthCredentials('PLAIN')).toBeNull();
  });

  it('returns null when clientId is missing from oauth2 data', () => {
    const partial = { type: 'oauth2', clientSecret: 'cs', tokenUrl: 'url' };
    seed({ type: 'agent_job_secret', key: 'P', value: encVal(JSON.stringify(partial)) });
    expect(getAgentJobSecretOAuthCredentials('P')).toBeNull();
  });

  it('returns null when clientSecret is missing from oauth2 data', () => {
    const partial = { type: 'oauth2', clientId: 'cid', tokenUrl: 'url' };
    seed({ type: 'agent_job_secret', key: 'P2', value: encVal(JSON.stringify(partial)) });
    expect(getAgentJobSecretOAuthCredentials('P2')).toBeNull();
  });

  it('returns null when decryption fails', () => {
    seed({ type: 'agent_job_secret', key: 'BAD', value: JSON.stringify('corrupted') });
    expect(getAgentJobSecretOAuthCredentials('BAD')).toBeNull();
  });
});

describe('deleteAgentJobSecret', () => {
  it('removes the agent secret', () => {
    seed({ type: 'agent_job_secret', key: 'DEL' });
    deleteAgentJobSecret('DEL');
    expect(rowCount()).toBe(0);
  });
});

describe('listAgentJobSecrets', () => {
  it('detects oauth2 secret type', () => {
    const data = { type: 'oauth2', clientId: 'c', clientSecret: 's' };
    seed({ type: 'agent_job_secret', key: 'OAUTH2', value: encVal(JSON.stringify(data)), updatedAt: 9000 });

    const result = listAgentJobSecrets();
    expect(result).toEqual([{ key: 'OAUTH2', isSet: true, updatedAt: 9000, secretType: 'oauth2' }]);
  });

  it('detects oauth_token secret type', () => {
    const data = { type: 'oauth_token', token: 'tok' };
    seed({ type: 'agent_job_secret', key: 'OTOKEN', value: encVal(JSON.stringify(data)), updatedAt: 8000 });

    expect(listAgentJobSecrets()[0].secretType).toBe('oauth_token');
  });

  it('defaults to manual for plain string secrets', () => {
    seed({ type: 'agent_job_secret', key: 'PLAIN', value: encVal('just-a-string'), updatedAt: 7000 });
    expect(listAgentJobSecrets()[0].secretType).toBe('manual');
  });

  it('defaults to manual when inner JSON parse fails', () => {
    seed({ type: 'agent_job_secret', key: 'BADJSON', value: encVal('not{json'), updatedAt: 6000 });
    expect(listAgentJobSecrets()[0].secretType).toBe('manual');
  });

  it('defaults to manual when decrypt fails', () => {
    seed({ type: 'agent_job_secret', key: 'CORRUPT', value: JSON.stringify('no-enc-prefix'), updatedAt: 5000 });
    expect(listAgentJobSecrets()[0].secretType).toBe('manual');
  });

  it('returns empty array when no agent secrets exist', () => {
    expect(listAgentJobSecrets()).toEqual([]);
  });
});

describe('getAllAgentJobSecrets', () => {
  it('returns decrypted value for plain secrets', () => {
    seed({ type: 'agent_job_secret', key: 'PLAIN', value: encVal('my-secret') });
    const result = getAllAgentJobSecrets();
    expect(result).toEqual([{ key: 'PLAIN', value: 'my-secret' }]);
  });

  it('returns null value for oauth2 type secrets', () => {
    const data = { type: 'oauth2', clientId: 'c', clientSecret: 's' };
    seed({ type: 'agent_job_secret', key: 'OA', value: encVal(JSON.stringify(data)) });
    expect(getAllAgentJobSecrets()).toEqual([{ key: 'OA', value: null }]);
  });

  it('returns null value for oauth_token type secrets', () => {
    const data = { type: 'oauth_token', token: 'tok' };
    seed({ type: 'agent_job_secret', key: 'OT', value: encVal(JSON.stringify(data)) });
    expect(getAllAgentJobSecrets()).toEqual([{ key: 'OT', value: null }]);
  });

  it('filters out entries where decryption fails and logs warning', () => {
    seed({ type: 'agent_job_secret', key: 'BAD', value: JSON.stringify('corrupted') });
    const result = getAllAgentJobSecrets();
    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to decrypt agent secret "BAD"'),
      expect.any(String),
    );
  });

  it('returns empty array when no secrets exist', () => {
    expect(getAllAgentJobSecrets()).toEqual([]);
  });
});

describe('getAgentJobSecretRaw', () => {
  it('returns the decrypted raw value', () => {
    seed({ type: 'agent_job_secret', key: 'RAW', value: encVal('raw-secret-value') });
    expect(getAgentJobSecretRaw('RAW')).toBe('raw-secret-value');
  });

  it('returns null when key does not exist', () => {
    expect(getAgentJobSecretRaw('MISSING')).toBeNull();
  });

  it('returns null when decryption fails', () => {
    seed({ type: 'agent_job_secret', key: 'BAD', value: JSON.stringify('corrupted') });
    expect(getAgentJobSecretRaw('BAD')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Migration: env → DB
// ═══════════════════════════════════════════════════════════════════════════════

describe('migrateEnvToDb', () => {
  const ENV_SECRETS = [
    'GH_TOKEN', 'GH_WEBHOOK_SECRET', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
    'GOOGLE_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET',
  ];
  const ENV_CONFIG = ['LLM_PROVIDER', 'LLM_MODEL', 'LLM_MAX_TOKENS', 'AGENT_BACKEND', 'CUSTOM_OPENAI_BASE_URL', 'TELEGRAM_CHAT_ID'];
  const ALL_KEYS = [...ENV_SECRETS, ...ENV_CONFIG, 'OPENAI_BASE_URL', 'CUSTOM_API_KEY'];

  let savedEnv;

  beforeEach(() => {
    savedEnv = {};
    for (const k of ALL_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ALL_KEYS) {
      if (savedEnv[k] !== undefined) {
        process.env[k] = savedEnv[k];
      } else {
        delete process.env[k];
      }
    }
  });

  it('skips migration when config rows already exist', () => {
    seed({ type: 'config', key: 'EXISTING' });
    process.env.GH_TOKEN = 'ghp_test';
    migrateEnvToDb();
    // Only the seed row should exist — no migration happened
    expect(rowCount()).toBe(1);
    expect(allRows()[0].key).toBe('EXISTING');
    expect(mockEncrypt).not.toHaveBeenCalled();
    expect(mockCreateOAuthToken).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('skips migration when config_secret rows already exist', () => {
    seed({ type: 'config_secret', key: 'EXISTING_SECRET' });
    process.env.GH_TOKEN = 'ghp_test';
    migrateEnvToDb();
    expect(rowCount()).toBe(1);
    expect(mockEncrypt).not.toHaveBeenCalled();
  });

  it('migrates secret env vars to config_secret rows', () => {
    process.env.GH_TOKEN = 'ghp_test123';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    migrateEnvToDb();

    const secrets = allRows().filter((r) => r.type === 'config_secret');
    expect(secrets).toHaveLength(2);

    const keys = secrets.map((r) => r.key).sort();
    expect(keys).toEqual(['ANTHROPIC_API_KEY', 'GH_TOKEN']);

    // Verify encryption was called with the raw values
    expect(mockEncrypt).toHaveBeenCalledWith('ghp_test123');
    expect(mockEncrypt).toHaveBeenCalledWith('sk-ant-test');
  });

  it('migrates config env vars to config rows', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.LLM_MODEL = 'claude-opus';
    migrateEnvToDb();

    const configs = allRows().filter((r) => r.type === 'config');
    expect(configs).toHaveLength(2);

    const providerRow = configs.find((r) => r.key === 'LLM_PROVIDER');
    expect(JSON.parse(providerRow.value)).toBe('anthropic');
  });

  it('routes CLAUDE_CODE_OAUTH_TOKEN through createOAuthToken', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth-tok-123';
    migrateEnvToDb();

    expect(mockCreateOAuthToken).toHaveBeenCalledWith('claudeCode', 'OAuth Token', 'oauth-tok-123', 'migration');
    // Should NOT create a config_secret row directly
    const secrets = allRows().filter((r) => r.type === 'config_secret');
    expect(secrets).toHaveLength(0);
  });

  it('skips env vars that are not set', () => {
    // No env vars set → nothing migrated
    migrateEnvToDb();
    expect(rowCount()).toBe(0);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('logs migration count when vars are migrated', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.GH_TOKEN = 'ghp_x';
    migrateEnvToDb();
    expect(console.log).toHaveBeenCalledWith('Migrated 2 config values from .env to database');
  });

  it('migrates custom provider when LLM_PROVIDER is custom with CUSTOM_OPENAI_BASE_URL', () => {
    process.env.LLM_PROVIDER = 'custom';
    process.env.CUSTOM_OPENAI_BASE_URL = 'https://custom.api.com';
    process.env.CUSTOM_API_KEY = 'ck-123';
    process.env.LLM_MODEL = 'custom-model';
    migrateEnvToDb();

    const providers = allRows().filter((r) => r.type === 'llm_provider');
    expect(providers).toHaveLength(1);
    expect(providers[0].key).toBe('custom');

    // Verify the encrypted config contains correct data
    expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify({
      name: 'Custom',
      baseUrl: 'https://custom.api.com',
      apiKey: 'ck-123',
      models: ['custom-model'],
    }));
  });

  it('falls back to OPENAI_BASE_URL when CUSTOM_OPENAI_BASE_URL is not set', () => {
    process.env.LLM_PROVIDER = 'custom';
    process.env.OPENAI_BASE_URL = 'https://fallback.api.com';
    migrateEnvToDb();

    const providers = allRows().filter((r) => r.type === 'llm_provider');
    expect(providers).toHaveLength(1);
    expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify({
      name: 'Custom',
      baseUrl: 'https://fallback.api.com',
      apiKey: '',
      models: [],
    }));
  });

  it('does not migrate custom provider when LLM_PROVIDER is not custom', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    migrateEnvToDb();

    const providers = allRows().filter((r) => r.type === 'llm_provider');
    expect(providers).toHaveLength(0);
  });
});
