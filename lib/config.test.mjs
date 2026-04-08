import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Use the real llm-providers (already tested)
// vi.mock not needed for llm-providers

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

  describe('LLM_MODEL special default (depends on LLM_PROVIDER)', () => {
    it('returns default model for anthropic when LLM_MODEL not set', () => {
      // LLM_PROVIDER defaults to 'anthropic'
      const model = getConfig('LLM_MODEL');
      expect(model).toBe('claude-sonnet-4-6');
    });

    it('returns default model for openai when LLM_PROVIDER is openai', () => {
      getConfigValue.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'openai';
        return null;
      });
      invalidateConfigCache();
      expect(getConfig('LLM_MODEL')).toBe('gpt-5.4');
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
      // LLM_PROVIDER is in CONFIG_KEYS, not ENV_KEYS, so env fallback shouldn't trigger
      // It will use default instead
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
    it('returns custom provider API key', () => {
      getConfigValue.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'my-custom';
        return null;
      });
      getCustomProvider.mockReturnValue({ apiKey: 'custom-key-123' });
      invalidateConfigCache();
      expect(getConfig('CUSTOM_API_KEY')).toBe('custom-key-123');
      expect(getCustomProvider).toHaveBeenCalledWith('my-custom');
    });

    it('returns undefined when custom provider has no API key', () => {
      getConfigValue.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'my-provider';
        return null;
      });
      getCustomProvider.mockReturnValue({ baseUrl: 'http://local' });
      invalidateConfigCache();
      expect(getConfig('CUSTOM_API_KEY')).toBeUndefined();
    });
  });

  describe('caching', () => {
    it('returns cached value on second call without re-querying DB', () => {
      getConfigValue.mockReturnValue('openai');
      getConfig('LLM_PROVIDER');
      getConfig('LLM_PROVIDER');
      // Should only call DB once
      expect(getConfigValue).toHaveBeenCalledTimes(1);
    });

    it('invalidateConfigCache forces re-query', () => {
      getConfigValue.mockReturnValue('openai');
      getConfig('LLM_PROVIDER');
      invalidateConfigCache();
      getConfigValue.mockReturnValue('google');
      expect(getConfig('LLM_PROVIDER')).toBe('google');
      expect(getConfigValue).toHaveBeenCalledTimes(2);
    });
  });

  describe('unknown keys', () => {
    it('returns undefined for completely unknown key', () => {
      expect(getConfig('NONEXISTENT_KEY')).toBeUndefined();
    });
  });
});
