import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { githubApi } from './github.js';
import { createModel } from '../ai/model.js';
import { getConfig } from '../config.js';
/**
 * Generate a short descriptive title for an agent job using the LLM.
 * Uses structured output to avoid thinking-token leaks with extended-thinking models.
 * @param {string} agentJobDescription - The full job description
 * @returns {Promise<string>} ~10 word title
 */
async function generateAgentJobTitle(agentJobDescription) {
  try {
    const model = await createModel({ maxTokens: 100 });
    const response = await model.withStructuredOutput(z.object({ title: z.string() })).invoke([
      ['system', 'Generate a descriptive ~10 word title for this agent job. The title should clearly describe what the job will do.'],
      ['human', agentJobDescription],
    ]);
    const rawTitle = response.title.trim();
    if (!rawTitle) {
      const desc = agentJobDescription;
      return desc.length > 80 ? desc.slice(0, 80).replace(/\s\S*$/, '...') : desc;
    }
    return rawTitle;
  } catch {
    // Fallback: first line, truncated to word boundary
    const firstLine = agentJobDescription.split('\n').find(l => l.trim()) || agentJobDescription;
    const desc = firstLine.replace(/^#+\s*/, '').trim();
    return desc.length > 80 ? desc.slice(0, 80).replace(/\s\S*$/, '...') : desc;
  }
}

/**
 * Create a new agent job: push branch to GitHub, then launch a local Docker container.
 * @param {string} agentJobDescription - The job description
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.llmModel] - LLM model override
 * @param {string} [options.agentBackend] - Agent backend override ('claude-code', 'pi', etc.)
 * @returns {Promise<{agent_job_id: string, branch: string, title: string}>}
 */
async function createAgentJob(agentJobDescription, options = {}) {
  const { GH_OWNER, GH_REPO } = process.env;
  const agentJobId = uuidv4();
  const branch = `agent-job/${agentJobId}`;
  const repo = `/repos/${GH_OWNER}/${GH_REPO}`;

  // Generate a short descriptive title
  const title = await generateAgentJobTitle(agentJobDescription);

  // 1. Get main branch SHA and its tree SHA
  const mainRef = await githubApi(`${repo}/git/ref/heads/main`);
  const mainSha = mainRef.object.sha;
  const mainCommit = await githubApi(`${repo}/git/commits/${mainSha}`);
  const baseTreeSha = mainCommit.tree.sha;

  // 2. Build agent-job.config.json — single source of truth for job metadata
  const config = { title, job: agentJobDescription };
  if (options.llmModel) config.llm_model = options.llmModel;
  if (options.agentBackend) config.agent_backend = options.agentBackend;

  const treeEntries = [
    {
      path: `logs/${agentJobId}/agent-job.config.json`,
      mode: '100644',
      type: 'blob',
      content: JSON.stringify(config, null, 2),
    },
  ];

  // 3. Create tree (base_tree preserves all existing files)
  const tree = await githubApi(`${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeEntries,
    }),
  });

  // 4. Create a single commit with job config
  const commit = await githubApi(`${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `🤖 Agent Job: ${title}`,
      tree: tree.sha,
      parents: [mainSha],
    }),
  });

  // 5. Create branch pointing to the commit
  await githubApi(`${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: commit.sha,
    }),
  });

  // 6. Launch Docker container locally (fire-and-forget with async cleanup)
  const repoSlug = `${GH_OWNER}/${GH_REPO}`;
  launchAgentJobContainer({
    agentJobId,
    repo: repoSlug,
    branch,
    title,
    description: agentJobDescription,
    codingAgent: options.agentBackend,
    llmModel: options.llmModel,
  }).catch(err => {
    console.error(`[agent-job] Failed to launch container for ${agentJobId}:`, err.message);
  });

  return { agent_job_id: agentJobId, branch, title };
}

/**
 * Launch the agent-job Docker container and handle cleanup after exit.
 * @param {object} params - Same as runAgentJobContainer options
 */
async function launchAgentJobContainer(params) {
  const { runAgentJobContainer, waitForContainer, removeVolume } = await import('./docker.js');

  const { containerName, volumeName } = await runAgentJobContainer(params);

  // Async cleanup: wait for container to exit, then remove the volume
  try {
    const exitCode = await waitForContainer(containerName);
    console.log(`[agent-job] ${params.agentJobId.slice(0, 8)} exited with code ${exitCode}`);
  } catch (err) {
    // Container may already be gone (AutoRemove)
    console.error(`[agent-job] wait error for ${params.agentJobId.slice(0, 8)}:`, err.message);
  }

  // Always try to remove the volume (container is auto-removed)
  try {
    await removeVolume(volumeName);
    console.log(`[agent-job] volume ${volumeName} removed`);
  } catch (err) {
    console.error(`[agent-job] failed to remove volume ${volumeName}:`, err.message);
  }
}

export { createAgentJob };
