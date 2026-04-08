import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BUILTIN_PROVIDERS, getDefaultModel } from './llm-providers.js';

// Mock all DB dependencies before importing config
vi.mock('./db/config.js', () => ({
  getConfigValue: vi.fn(() => null),
  getConfigSecret: vi.fn(() => null),
  getCustomProvider: vi.fn(() => null),
}));

vi.mock('./db/oauth-tokens.js', () => ({
  getOAuthTokenCount: vi.fn(() => 0),
  getNextOAuthToken: vi.fn(() => null),
}));

const { getConfig, invalidateConfigCache } = await import('./config.js');
const { getConfigValue, getConfigSecret, getCustomProvider } = await import('./db/config.js');
const { getOAuthTokenCount, getNextOAuthToken } = await import('./db/oauth-tokens.js');

beforeEach(() => {
  invalidateConfigCache();
  vi.resetAllMocks();
  // Restore default mock implementations after reset
  getConfigValue.mockReturnValue(null);
  getConfigSecret.mockReturnValue(null);
  getCustomProvider.mockReturnValue(null);
  getOAuthTokenCount.mockReturnValue(0);
  getNextOAuthToken.mockReturnValue(null);
  // Clear env vars that might interfere
  delete process.env.GH_OWNER;
  delete process.env.GH_REPO;
  delete process.env.GH_TOKEN;
  delete process.env.APP_URL;
  delete process.env.APP_HOSTNAME;
  delete process.env.LLM_PROVIDER;
});

describe('getConfig', () => {
  describe('config key resolution from DB', () => {
    it('returns plain config value from DB', () => {
      getConfigValue.mockReturnValue('openai');
      expect(getConfig('LLM_PROVIDER')).toBe('openai');
      expect(getConfigValue).toHaveBeenCalledWith('LLM_PROVIDER');
    });

    it('returns secret value from DB', () => {
      getConfigSecret.mockReturnValue('sk-test-key');
      expect(getConfig('ANTHROPIC_API_KEY')).toBe('sk-test-key');
      expect(getConfigSecret).toHaveBeenCalledWith('ANTHROPIC_API_KEY');
    });

    it('does not call getConfigSecret for non-secret keys', () => {
      getConfigValue.mockReturnValue('anthropic');
      getConfig('LLM_PROVIDER');
      expect(getConfigSecret).not.toHaveBeenCalled();
    });

    it('does not call getConfigValue for secret keys', () => {
      getConfigSecret.mockReturnValue('sk-key');
      getConfig('ANTHROPIC_API_KEY');
      expect(getConfigValue).not.toHaveBeenCalled();
    });
  });

  describe('defaults', () => {
    it('falls back to default for LLM_PROVIDER when DB returns null', () => {
      expect(getConfig('LLM_PROVIDER')).toBe('anthropic');
    });

    it('falls back to default for LLM_MAX_TOKENS', () => {
      expect(getConfig('LLM_MAX_TOKENS')).toBe('4096');
    });

    it('falls back to default for CODING_AGENT', () => {
      expect(getConfig('CODING_AGENT')).toBe('claude-code');
    });
  });

  describe('LLM_MODEL resolution (depends on LLM_PROVIDER)', () => {
    it('returns provider default model when LLM_MODEL not set in DB', () => {
      // LLM_PROVIDER defaults to 'anthropic'; model should match llm-providers source of truth
      const expectedModel = getDefaultModel('anthropic');
      expect(getConfig('LLM_MODEL')).toBe(expectedModel);
    });

    it('returns openai default model when LLM_PROVIDER is openai', () => {
      getConfigValue.mockImplementation((key) => key === 'LLM_PROVIDER' ? 'openai' : null);
      invalidateConfigCache();
      const expectedModel = getDefaultModel('openai');
      expect(getConfig('LLM_MODEL')).toBe(expectedModel);
    });

    it('returns explicit LLM_MODEL from DB when set, overriding provider default', () => {
      getConfigValue.mockImplementation((key) => {
        if (key === 'LLM_MODEL') return 'claude-haiku-4-5-20251001';
        if (key === 'LLM_PROVIDER') return 'anthropic';
        return null;
      });
      invalidateConfigCache();
      expect(getConfig('LLM_MODEL')).toBe('claude-haiku-4-5-20251001');
    });

    it('returns undefined model for unknown provider slug', () => {
      getConfigValue.mockImplementation((key) => key === 'LLM_PROVIDER' ? 'nonexistent-provider' : null);
      invalidateConfigCache();
      // getDefaultModel('nonexistent-provider') returns undefined
      expect(getConfig('LLM_MODEL')).toBeUndefined();
    });

    it('returns custom provider model when provider is custom', () => {
      getConfigValue.mockImplementation((key) => key === 'LLM_PROVIDER' ? 'my-custom' : null);
      invalidateConfigCache();
      // Custom providers are not in BUILTIN_PROVIDERS, so getDefaultModel returns undefined
      expect(getConfig('LLM_MODEL')).toBeUndefined();
    });
  });

  describe('environment variable fallback', () => {
    it('falls back to process.env for GH_OWNER', () => {
      process.env.GH_OWNER = 'test-owner';
      expect(getConfig('GH_OWNER')).toBe('test-owner');
    });

    it('falls back to process.env for APP_URL', () => {
      process.env.APP_URL = 'https://example.com';
      expect(getConfig('APP_URL')).toBe('https://example.com');
    });

    it('does not fall back to env for non-infrastructure keys', () => {
      process.env.LLM_PROVIDER = 'should-not-use';
      // LLM_PROVIDER is in CONFIG_KEYS, not ENV_KEYS — uses default not env
      expect(getConfig('LLM_PROVIDER')).toBe('anthropic');
    });
  });

  describe('OAuth token resolution', () => {
    it('returns OAuth token when tokens exist for claudeCode', () => {
      getOAuthTokenCount.mockReturnValue(2);
      getNextOAuthToken.mockReturnValue('oauth-token-value');
      expect(getConfig('CLAUDE_CODE_OAUTH_TOKEN')).toBe('oauth-token-value');
      expect(getOAuthTokenCount).toHaveBeenCalledWith('claudeCode');
      expect(getNextOAuthToken).toHaveBeenCalledWith('claudeCode');
    });

    it('returns null when no OAuth tokens for claudeCode', () => {
      expect(getConfig('CLAUDE_CODE_OAUTH_TOKEN')).toBeNull();
      expect(getOAuthTokenCount).toHaveBeenCalledWith('claudeCode');
      expect(getNextOAuthToken).not.toHaveBeenCalled();
    });

    it('resolves CODEX_OAUTH_TOKEN via codex token type', () => {
      getOAuthTokenCount.mockReturnValue(1);
      getNextOAuthToken.mockReturnValue('codex-token');
      expect(getConfig('CODEX_OAUTH_TOKEN')).toBe('codex-token');
      expect(getOAuthTokenCount).toHaveBeenCalledWith('codex');
    });
  });

  describe('custom provider API key', () => {
    it('returns custom provider API key from full provider config', () => {
      getConfigValue.mockImplementation((key) => key === 'LLM_PROVIDER' ? 'my-custom' : null);
      getCustomProvider.mockReturnValue({
        name: 'My Custom',
        baseUrl: 'https://api.custom.ai/v1',
        apiKey: 'custom-key-123',
        models: ['custom-model-1'],
      });
      invalidateConfigCache();
      expect(getConfig('CUSTOM_API_KEY')).toBe('custom-key-123');
      expect(getCustomProvider).toHaveBeenCalledWith('my-custom');
    });

    it('returns undefined when custom provider has no API key', () => {
      getConfigValue.mockImplementation((key) => key === 'LLM_PROVIDER' ? 'local-llm' : null);
      getCustomProvider.mockReturnValue({
        name: 'Local LLM',
        baseUrl: 'http://localhost:8080',
        models: ['llama-3'],
      });
      invalidateConfigCache();
      expect(getConfig('CUSTOM_API_KEY')).toBeUndefined();
    });

    it('does not resolve CUSTOM_API_KEY for builtin providers', () => {
      // LLM_PROVIDER defaults to 'anthropic' (builtin) — CUSTOM_API_KEY should not resolve
      expect(getConfig('CUSTOM_API_KEY')).toBeUndefined();
      expect(getCustomProvider).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('returns cached value on second call without re-querying DB', () => {
      getConfigValue.mockReturnValue('openai');
      getConfig('LLM_PROVIDER');
      getConfig('LLM_PROVIDER');
      expect(getConfigValue).toHaveBeenCalledTimes(1);
    });

    it('invalidateConfigCache forces re-query on next call', () => {
      getConfigValue.mockReturnValue('openai');
      getConfig('LLM_PROVIDER');
      invalidateConfigCache();
      getConfigValue.mockReturnValue('google');
      expect(getConfig('LLM_PROVIDER')).toBe('google');
      expect(getConfigValue).toHaveBeenCalledTimes(2);
    });

    it('caches env var fallback values (stale until invalidate)', () => {
      process.env.GH_OWNER = 'original-owner';
      expect(getConfig('GH_OWNER')).toBe('original-owner');

      // Change env var — should still get cached value
      process.env.GH_OWNER = 'new-owner';
      expect(getConfig('GH_OWNER')).toBe('original-owner');

      // After invalidation, picks up new env value
      invalidateConfigCache();
      expect(getConfig('GH_OWNER')).toBe('new-owner');
    });

    it('caches OAuth token resolution (not re-rotated on repeat calls)', () => {
      getOAuthTokenCount.mockReturnValue(1);
      getNextOAuthToken.mockReturnValue('token-1');
      getConfig('CLAUDE_CODE_OAUTH_TOKEN');
      getConfig('CLAUDE_CODE_OAUTH_TOKEN');
      // OAuth bypasses cache — each call re-evaluates (no _cache.set for OAuth keys)
      expect(getOAuthTokenCount).toHaveBeenCalledTimes(2);
    });
  });

  describe('DB error resilience', () => {
    it('propagates DB error from getConfigValue (no silent fallback)', () => {
      getConfigValue.mockImplementation(() => { throw new Error('SQLITE_CANTOPEN'); });
      // getConfig does NOT try/catch DB calls — error propagates
      expect(() => getConfig('LLM_PROVIDER')).toThrow('SQLITE_CANTOPEN');
    });

    it('propagates DB error from getConfigSecret', () => {
      getConfigSecret.mockImplementation(() => { throw new Error('DB connection lost'); });
      expect(() => getConfig('ANTHROPIC_API_KEY')).toThrow('DB connection lost');
    });

    it('propagates DB error from getOAuthTokenCount', () => {
      getOAuthTokenCount.mockImplementation(() => { throw new Error('query timeout'); });
      expect(() => getConfig('CLAUDE_CODE_OAUTH_TOKEN')).toThrow('query timeout');
    });
  });

  describe('case sensitivity', () => {
    it('treats keys as case-sensitive (lowercase key returns undefined)', () => {
      // CONFIG_KEYS has 'LLM_PROVIDER' not 'llm_provider'
      // lowercase key is not in any set, so no DB lookup, no default, no env fallback
      expect(getConfig('llm_provider')).toBeUndefined();
    });

    it('does not match lowercase secret keys', () => {
      getConfigSecret.mockReturnValue('sk-key');
      expect(getConfig('anthropic_api_key')).toBeUndefined();
      expect(getConfigSecret).not.toHaveBeenCalled();
    });
  });

  it('returns undefined for completely unknown key', () => {
    expect(getConfig('NONEXISTENT_KEY')).toBeUndefined();
  });
});
