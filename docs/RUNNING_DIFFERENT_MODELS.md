# Running Different Models

## Overview

thepopebot has two layers that use LLMs independently:

- **Event Handler** — powers web chat, Telegram responses, webhook processing, and job summaries. Configured via the admin UI.
- **Coding Agents** — Docker containers for code workspaces and agent jobs (Claude Code, Pi, etc.). Configured separately via the admin UI.

Because these are independent, you can run a capable model for interactive chat and a different model for coding tasks — or vice versa.

All LLM configuration is managed through the admin UI. The `.env` file is only used for initial bootstrapping — values migrate to the database on first startup.

## Configuring the Chat Model

The chat model controls all Event Handler LLM interactions: web chat, Telegram replies, webhook trigger processing, and job completion summaries.

1. **Add API keys**: Go to **Admin > Event Handler > LLMs** (`/admin/event-handler/llms`) to add your provider API keys.
2. **Select provider and model**: Go to **Admin > Event Handler > Chat** (`/admin/event-handler/chat`) to choose your provider and model.

`LLM_MAX_TOKENS` defaults to 4096.

## Configuring Coding Agent Models

The coding agent (code workspaces, agent jobs) can use a different provider and model from the chat layer. Configure at **Admin > Event Handler > Coding Agents**.

See [CODING_AGENTS.md](CODING_AGENTS.md) for details.

## Per-Job Overrides

Add `llm_provider` and `llm_model` to any agent-type entry in `agent-job/CRONS.json` or any action in `event-handler/TRIGGERS.json`. This overrides the default for just that one job:

```json
{
  "name": "Code review",
  "schedule": "0 9 * * 1",
  "type": "agent",
  "job": "Review open PRs and leave comments",
  "llm_provider": "openai",
  "llm_model": "gpt-5.4"
}
```

The matching API key must already be configured in the admin UI.

## Provider Reference

| Provider | `LLM_PROVIDER` value | Default Model | API Key Variable |
|----------|---------------------|---------------|------------------|
| Anthropic | `anthropic` (default) | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `gpt-5.4` | `OPENAI_API_KEY` |
| Google | `google` | `gemini-2.5-flash` | `GOOGLE_API_KEY` |
| DeepSeek | `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| MiniMax | `minimax` | `MiniMax-M2.7` | `MINIMAX_API_KEY` |
| Mistral | `mistral` | `mistral-large-latest` | `MISTRAL_API_KEY` |
| xAI | `xai` | `grok-4.20-0309-non-reasoning` | `XAI_API_KEY` |
| Kimi | `kimi` | `kimi-k2.5` | `MOONSHOT_API_KEY` |
| OpenRouter | `openrouter` | (user-specified) | `OPENROUTER_API_KEY` |
| Custom | (user-defined) | (user-defined) | (user-defined) |

**Provider notes:**

- **Google Gemini**: `gemini-2.5-pro` and `gemini-3.*` models auto-fallback to `gemini-2.5-flash` for chat due to a LangChain compatibility issue ([#201](https://github.com/thepopebotbot/thepopebot/issues/201)). They work fine as coding agent models.
- **OpenRouter**: No pre-defined model list — type in the model ID you want (e.g. `anthropic/claude-sonnet-4-6`).

## Adding Custom Providers

Custom providers let you connect any OpenAI-compatible API. Add them via **Admin > Event Handler > LLMs**. Each custom provider supports:

- Multiple models
- A base URL
- An optional API key

This works for DeepSeek, Ollama, Together AI, LM Studio, vLLM, Fireworks, and any other OpenAI-compatible endpoint.

## Local Models (Ollama, LM Studio, vLLM)

For models running on your host machine, use Docker networking to reach them from containers:

```
http://host.docker.internal:11434/v1
```

Set this as the base URL when adding a custom provider in the admin UI. Most local servers don't require an API key.

> **Why `host.docker.internal`?** thepopebot runs inside Docker containers, so `localhost` refers to the container itself. `host.docker.internal` routes to the host machine where your local model server is running.

## Quick Reference

| What | Where to configure |
|------|--------------------|
| Chat model (web chat, Telegram, webhooks) | Admin > Event Handler > Chat |
| API keys and providers | Admin > Event Handler > LLMs |
| Coding agent model (workspaces, jobs) | Admin > Event Handler > Coding Agents |
| Per-job override | `llm_provider` + `llm_model` in `agent-job/CRONS.json` or `event-handler/TRIGGERS.json` |
| Custom provider (cloud) | Admin > Event Handler > LLMs > Add custom provider with base URL |
| Custom provider (local) | Same as above, use `http://host.docker.internal:<port>/v1` as base URL |
