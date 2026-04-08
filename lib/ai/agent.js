import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage } from '@langchain/core/messages';
import { createModel } from './model.js';
import { agentJobTool, agentChatCodingTool, codeChatCodingTool } from './tools.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import path from 'path';
import { PROJECT_ROOT } from '../paths.js';
import { render_md, clearRenderCache } from '../utils/render-md.js';

// Singletons on globalThis to survive Next.js webpack chunk duplication.
// Server actions and route handlers may be bundled into separate chunks, each
// with their own copy of module-level variables. globalThis is shared across all chunks.

/**
 * Get or create the LangGraph agent chat singleton.
 * Uses createReactAgent which handles the tool loop automatically.
 * Prompt is a function so {{datetime}} resolves fresh each invocation.
 */
export async function getAgentChat() {
  if (!globalThis.__popebotAgentChat) {
    const model = await createModel();
    const tools = [agentJobTool, agentChatCodingTool];

    const dbPath = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'data/db/thepopebot.sqlite');
    const checkpointer = SqliteSaver.fromConnString(dbPath);

    globalThis.__popebotAgentChat = createReactAgent({
      llm: model,
      tools,
      checkpointSaver: checkpointer,
      prompt: async (state) => [new SystemMessage(await render_md(path.join(PROJECT_ROOT, 'event-handler/agent-chat/SYSTEM.md'))), ...state.messages],
    });
  }
  return globalThis.__popebotAgentChat;
}

/**
 * Get or create the code chat singleton.
 * Uses a static codeChatCodingTool that reads context from runtime.configurable.
 */
export async function getCodeChat() {
  if (!globalThis.__popebotCodeChat) {
    const model = await createModel();
    const tools = [codeChatCodingTool];

    const dbPath = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'data/db/thepopebot.sqlite');
    const checkpointer = SqliteSaver.fromConnString(dbPath);

    globalThis.__popebotCodeChat = createReactAgent({
      llm: model,
      tools,
      checkpointSaver: checkpointer,
      prompt: async (state) => [new SystemMessage(await render_md(path.join(PROJECT_ROOT, 'event-handler/code-chat/SYSTEM.md'))), ...state.messages],
    });
  }
  return globalThis.__popebotCodeChat;
}

/**
 * Reset all agent singletons (e.g., when config changes).
 */
export function resetAgentChats() {
  globalThis.__popebotAgentChat = null;
  globalThis.__popebotCodeChat = null;
  clearRenderCache();
}
