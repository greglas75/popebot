/** @type {import('next').NextConfig} */
export default {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  transpilePackages: ['thepopebot'],
  serverExternalPackages: [
    'better-sqlite3', 'drizzle-orm',
    '@langchain/anthropic', '@langchain/core', '@langchain/google-genai',
    '@langchain/langgraph', '@langchain/langgraph-checkpoint-sqlite', '@langchain/openai',
  ],
};
