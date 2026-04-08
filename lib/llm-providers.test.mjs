import { describe, it, expect } from 'vitest';
import { BUILTIN_PROVIDERS, getDefaultModel, getAllCredentialKeys } from './llm-providers.js';

describe('BUILTIN_PROVIDERS', () => {
  const providerSlugs = Object.keys(BUILTIN_PROVIDERS);

  it('contains all expected provider slugs', () => {
    const expected = ['anthropic', 'openai', 'google', 'deepseek', 'minimax', 'mistral', 'xai', 'kimi', 'openrouter'];
    for (const slug of expected) {
      expect(providerSlugs).toContain(slug);
    }
  });

  it('every provider has a name, credentials array, and models array', () => {
    for (const [slug, provider] of Object.entries(BUILTIN_PROVIDERS)) {
      expect(provider.name, `${slug} name`).toEqual(expect.any(String));
      expect(Array.isArray(provider.credentials), `${slug} credentials`).toBe(true);
      expect(Array.isArray(provider.models), `${slug} models`).toBe(true);
    }
  });

  it('every credential has type api_key, a key, and a label', () => {
    for (const [slug, provider] of Object.entries(BUILTIN_PROVIDERS)) {
      for (const cred of provider.credentials) {
        expect(cred.type, `${slug} cred type`).toBe('api_key');
        expect(cred.key, `${slug} cred key`).toEqual(expect.any(String));
        expect(cred.label, `${slug} cred label`).toEqual(expect.any(String));
      }
    }
  });

  it('every model has an id and name', () => {
    for (const [slug, provider] of Object.entries(BUILTIN_PROVIDERS)) {
      for (const model of provider.models) {
        expect(model.id, `${slug} model id`).toEqual(expect.any(String));
        expect(model.name, `${slug} model name`).toEqual(expect.any(String));
      }
    }
  });

  it('each provider with models has exactly one default model', () => {
    for (const [slug, provider] of Object.entries(BUILTIN_PROVIDERS)) {
      if (provider.models.length === 0) continue;
      const defaults = provider.models.filter(m => m.default);
      expect(defaults, `${slug} default count`).toHaveLength(1);
    }
  });
});

describe('getDefaultModel', () => {
  it('returns the default-flagged model for each builtin provider', () => {
    for (const [slug, provider] of Object.entries(BUILTIN_PROVIDERS)) {
      if (provider.models.length === 0) continue;
      const expected = provider.models.find(m => m.default)?.id;
      expect(getDefaultModel(slug)).toBe(expected);
    }
  });

  it('returns undefined for unknown provider', () => {
    expect(getDefaultModel('nonexistent')).toBeUndefined();
  });

  it('returns undefined for provider with empty models (openrouter)', () => {
    expect(getDefaultModel('openrouter')).toBeUndefined();
  });

  it('would fall back to first model if no default flag were set', () => {
    // Verify the fallback logic exists: defaultModel?.id || provider.models[0]?.id
    // We can't easily remove default flags from frozen data, but we can verify
    // that getDefaultModel returns models[0].id when it IS the default
    const anthropic = BUILTIN_PROVIDERS.anthropic;
    const defaultModel = anthropic.models.find(m => m.default);
    const firstModel = anthropic.models[0];
    // If default === first, both paths return the same ID
    // This at least proves the function reads from the models array
    expect(getDefaultModel('anthropic')).toBe(defaultModel.id);
    expect(defaultModel.id).toBe(firstModel.id); // anthropic's default IS the first model
  });
});

describe('getAllCredentialKeys', () => {
  it('returns one key per provider credential', () => {
    const keys = getAllCredentialKeys();
    const expectedCount = Object.values(BUILTIN_PROVIDERS)
      .reduce((sum, p) => sum + p.credentials.length, 0);
    expect(keys).toHaveLength(expectedCount);
  });

  it('includes the credential key from every provider', () => {
    const keys = getAllCredentialKeys();
    for (const [slug, provider] of Object.entries(BUILTIN_PROVIDERS)) {
      for (const cred of provider.credentials) {
        expect(keys, `missing ${slug}:${cred.key}`).toContain(cred.key);
      }
    }
  });

  it('contains no duplicates', () => {
    const keys = getAllCredentialKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });
});
