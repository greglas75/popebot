import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BUILTIN_PROVIDERS } from '../llm-providers.js';

// Mock config and all LLM SDK imports
vi.mock('../config.js', () => ({ getConfig: vi.fn() }));
vi.mock('../db/config.js', () => ({ getCustomProvider: vi.fn() }));
// Mocks must be constructable (used with `new`)
function makeConstructor(name) {
  const ctor = vi.fn().mockImplementation(function (cfg) {
    Object.assign(this, { _type: name, ...cfg });
  });
  return ctor;
}
vi.mock('@langchain/anthropic', () => ({ ChatAnthropic: makeConstructor('anthropic') }));
vi.mock('@langchain/openai', () => ({ ChatOpenAI: makeConstructor('openai') }));
vi.mock('@langchain/google-genai', () => ({ ChatGoogleGenerativeAI: makeConstructor('google') }));

const { createModel } = await import('./model.js');
const { getConfig } = await import('../config.js');
const { getCustomProvider } = await import('../db/config.js');
const { ChatAnthropic } = await import('@langchain/anthropic');
const { ChatOpenAI } = await import('@langchain/openai');
const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function mockProvider(provider, model, extraConfig = {}) {
  getConfig.mockImplementation((key) => {
    if (key === 'LLM_PROVIDER') return provider;
    if (key === 'LLM_MODEL') return model;
    if (key === 'LLM_MAX_TOKENS') return '4096';
    // Provider-specific API keys
    if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-test';
    if (key === 'OPENAI_API_KEY') return 'sk-openai-test';
    if (key === 'GOOGLE_API_KEY') return 'google-test-key';
    if (key === 'DEEPSEEK_API_KEY') return 'sk-deepseek';
    if (key === 'MINIMAX_API_KEY') return 'sk-minimax';
    if (key === 'MISTRAL_API_KEY') return 'sk-mistral';
    if (key === 'XAI_API_KEY') return 'sk-xai';
    if (key === 'MOONSHOT_API_KEY') return 'sk-moonshot';
    if (key === 'OPENROUTER_API_KEY') return 'sk-openrouter';
    if (key === 'CUSTOM_OPENAI_BASE_URL') return extraConfig.baseURL || null;
    return null;
  });
}

describe('createModel', () => {
  describe('anthropic provider', () => {
    it('creates ChatAnthropic with correct config', async () => {
      mockProvider('anthropic', 'claude-sonnet-4-6');
      const model = await createModel();
      expect(ChatAnthropic).toHaveBeenCalledWith({
        modelName: 'claude-sonnet-4-6',
        maxTokens: 4096,
        anthropicApiKey: 'sk-ant-test',
      });
    });

    it('uses maxTokens from options when provided', async () => {
      mockProvider('anthropic', 'claude-opus-4-6');
      await createModel({ maxTokens: 8192 });
      expect(ChatAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 8192 }),
      );
    });

    it('throws when ANTHROPIC_API_KEY is missing', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'anthropic';
        if (key === 'LLM_MODEL') return 'claude-sonnet-4-6';
        if (key === 'LLM_MAX_TOKENS') return '4096';
        return null; // no API key
      });
      await expect(createModel()).rejects.toThrow('No chat LLM configured');
    });
  });

  describe('openai provider', () => {
    it('creates ChatOpenAI with correct config', async () => {
      mockProvider('openai', 'gpt-5.4');
      await createModel();
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        modelName: 'gpt-5.4',
        maxTokens: 4096,
        apiKey: 'sk-openai-test',
      }));
    });

    it('includes baseURL when CUSTOM_OPENAI_BASE_URL is set', async () => {
      mockProvider('openai', 'gpt-5.4', { baseURL: 'https://my-proxy.com/v1' });
      await createModel();
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        configuration: { baseURL: 'https://my-proxy.com/v1' },
      }));
    });

    it('throws when no API key and no base URL', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'openai';
        if (key === 'LLM_MODEL') return 'gpt-5.4';
        if (key === 'LLM_MAX_TOKENS') return '4096';
        return null;
      });
      await expect(createModel()).rejects.toThrow('No chat LLM configured');
    });
  });

  describe('google provider', () => {
    it('creates ChatGoogleGenerativeAI with correct config', async () => {
      mockProvider('google', 'gemini-2.5-flash');
      await createModel();
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        maxOutputTokens: 4096,
        apiKey: 'google-test-key',
      });
    });

    it('falls back to gemini-2.5-flash for unsupported models', async () => {
      mockProvider('google', 'gemini-2.5-pro');
      await createModel();
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-flash' }),
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('gemini-2.5-pro requires thought_signature'),
      );
    });

    it('falls back for gemini-3 prefix models', async () => {
      mockProvider('google', 'gemini-3-flash');
      await createModel();
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-flash' }),
      );
    });

    it('does not fall back for supported models', async () => {
      mockProvider('google', 'gemini-2.5-flash');
      await createModel();
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-flash' }),
      );
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('throws when GOOGLE_API_KEY is missing', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'google';
        if (key === 'LLM_MODEL') return 'gemini-2.5-flash';
        if (key === 'LLM_MAX_TOKENS') return '4096';
        return null;
      });
      await expect(createModel()).rejects.toThrow('No chat LLM configured');
    });
  });

  describe('OpenAI-compatible providers (deepseek, minimax, mistral, xai, kimi, openrouter)', () => {
    const providers = [
      { slug: 'deepseek', keyConfig: 'DEEPSEEK_API_KEY', baseURL: 'https://api.deepseek.com' },
      { slug: 'minimax', keyConfig: 'MINIMAX_API_KEY', baseURL: 'https://api.minimax.io/v1' },
      { slug: 'mistral', keyConfig: 'MISTRAL_API_KEY', baseURL: 'https://api.mistral.ai/v1' },
      { slug: 'xai', keyConfig: 'XAI_API_KEY', baseURL: 'https://api.x.ai/v1' },
      { slug: 'kimi', keyConfig: 'MOONSHOT_API_KEY', baseURL: 'https://api.moonshot.cn/v1' },
      { slug: 'openrouter', keyConfig: 'OPENROUTER_API_KEY', baseURL: 'https://openrouter.ai/api/v1' },
    ];

    for (const { slug, keyConfig, baseURL } of providers) {
      it(`creates ChatOpenAI for ${slug} with correct baseURL`, async () => {
        const defaultModel = BUILTIN_PROVIDERS[slug]?.models[0]?.id || 'test-model';
        mockProvider(slug, defaultModel);
        await createModel();
        expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
          configuration: { baseURL },
        }));
      });

      it(`throws for ${slug} when API key is missing`, async () => {
        getConfig.mockImplementation((key) => {
          if (key === 'LLM_PROVIDER') return slug;
          if (key === 'LLM_MODEL') return 'some-model';
          if (key === 'LLM_MAX_TOKENS') return '4096';
          return null; // no API key
        });
        await expect(createModel()).rejects.toThrow('No chat LLM configured');
      });
    }
  });

  describe('custom provider (not in BUILTIN_PROVIDERS)', () => {
    it('creates ChatOpenAI with custom provider config', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'my-custom-llm';
        if (key === 'LLM_MODEL') return 'fallback-model';
        if (key === 'LLM_MAX_TOKENS') return '4096';
        return null;
      });
      getCustomProvider.mockReturnValue({
        name: 'My Custom',
        baseUrl: 'https://api.custom.ai/v1',
        apiKey: 'custom-key',
        models: ['custom-model-1'],
      });
      await createModel();
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        modelName: 'custom-model-1',
        maxTokens: 4096,
        apiKey: 'custom-key',
        configuration: { baseURL: 'https://api.custom.ai/v1' },
      }));
    });

    it('falls back to LLM_MODEL when custom provider has no models', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'local-llm';
        if (key === 'LLM_MODEL') return 'llama-3';
        if (key === 'LLM_MAX_TOKENS') return '2048';
        return null;
      });
      getCustomProvider.mockReturnValue({
        name: 'Local',
        baseUrl: 'http://localhost:8080',
      });
      await createModel();
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        modelName: 'llama-3',
        apiKey: 'not-needed',
      }));
    });

    it('uses "not-needed" when custom provider has no apiKey', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'local';
        if (key === 'LLM_MODEL') return 'model';
        if (key === 'LLM_MAX_TOKENS') return '4096';
        return null;
      });
      getCustomProvider.mockReturnValue({ name: 'Local', models: ['m1'] });
      await createModel();
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: 'not-needed',
      }));
    });

    it('throws when custom provider not found in DB', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'nonexistent-provider';
        if (key === 'LLM_MODEL') return 'model';
        if (key === 'LLM_MAX_TOKENS') return '4096';
        return null;
      });
      getCustomProvider.mockReturnValue(null);
      await expect(createModel()).rejects.toThrow('Unknown LLM provider: nonexistent-provider');
    });
  });

  describe('unknown builtin provider', () => {
    it('throws for completely unknown provider slug', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'totally-unknown';
        if (key === 'LLM_MODEL') return 'model';
        if (key === 'LLM_MAX_TOKENS') return '4096';
        return null;
      });
      // Not in BUILTIN_PROVIDERS AND getCustomProvider returns null
      getCustomProvider.mockReturnValue(null);
      await expect(createModel()).rejects.toThrow('Unknown LLM provider');
    });
  });

  describe('maxTokens resolution', () => {
    it('uses LLM_MAX_TOKENS from config when options.maxTokens not set', async () => {
      mockProvider('anthropic', 'claude-sonnet-4-6');
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'anthropic';
        if (key === 'LLM_MODEL') return 'claude-sonnet-4-6';
        if (key === 'LLM_MAX_TOKENS') return '8192';
        if (key === 'ANTHROPIC_API_KEY') return 'sk-ant';
        return null;
      });
      await createModel();
      expect(ChatAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 8192 }),
      );
    });

    it('defaults to 4096 when LLM_MAX_TOKENS is not set', async () => {
      getConfig.mockImplementation((key) => {
        if (key === 'LLM_PROVIDER') return 'anthropic';
        if (key === 'LLM_MODEL') return 'claude-sonnet-4-6';
        if (key === 'ANTHROPIC_API_KEY') return 'sk-ant';
        return null; // LLM_MAX_TOKENS not set
      });
      await createModel();
      expect(ChatAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 4096 }),
      );
    });

    it('options.maxTokens takes priority over config', async () => {
      mockProvider('anthropic', 'claude-sonnet-4-6');
      await createModel({ maxTokens: 16384 });
      expect(ChatAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 16384 }),
      );
    });
  });
});
