import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../paths.js';

const skillsDir = path.join(PROJECT_ROOT, 'skills');

const INCLUDE_PATTERN = /\{\{([^}]+\.md)\}\}/g;
const VARIABLE_PATTERN = /\{\{(datetime|skills)\}\}/gi;

// Cache: absolutePath → { mtimeMs, depMtimes: Map<path,mtimeMs>, content }
const cache = new Map();
let skillDescCache = null;
let skillsDirMtimeMs = null;
let skillFileMtimes = null; // Map<skillMdPath, mtimeMs>

/**
 * Clear all cached file content and skill descriptions.
 * Called by resetAgentChats() when config changes.
 */
export function clearRenderCache() {
  cache.clear();
  skillDescCache = null;
  skillsDirMtimeMs = null;
  skillFileMtimes = null;
}

// Scan skill directories under skills/active/ for SKILL.md files and extract
// description from YAML frontmatter. Returns a bullet list of descriptions.
async function loadSkillDescriptions() {
  const activeDir = path.join(skillsDir, 'active');

  // Check directory mtime to detect added/removed skills
  let dirStat;
  try {
    dirStat = await fs.promises.stat(activeDir);
  } catch {
    skillDescCache = 'No additional abilities configured.';
    skillsDirMtimeMs = null;
    skillFileMtimes = null;
    return skillDescCache;
  }

  // Check if any tracked SKILL.md file has changed
  let filesChanged = false;
  if (skillFileMtimes) {
    const checks = await Promise.all(
      [...skillFileMtimes.entries()].map(async ([filePath, oldMtime]) => {
        try {
          const s = await fs.promises.stat(filePath);
          return s.mtimeMs !== oldMtime;
        } catch {
          return true; // File deleted
        }
      })
    );
    filesChanged = checks.some(Boolean);
  }

  // Return cached if directory unchanged AND no skill files edited
  if (skillDescCache !== null && skillsDirMtimeMs === dirStat.mtimeMs && !filesChanged) {
    return skillDescCache;
  }

  try {
    const entries = await fs.promises.readdir(activeDir, { withFileTypes: true });
    const descriptions = [];
    const newFileMtimes = new Map();

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const skillMdPath = path.join(activeDir, entry.name, 'SKILL.md');
      try {
        const fileStat = await fs.promises.stat(skillMdPath);
        const content = await fs.promises.readFile(skillMdPath, 'utf8');
        newFileMtimes.set(skillMdPath, fileStat.mtimeMs);

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) continue;

        const frontmatter = frontmatterMatch[1];
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
        if (descMatch) {
          descriptions.push(`- ${descMatch[1].trim()}`);
        }
      } catch {
        // Skill directory without SKILL.md — skip
      }
    }

    skillDescCache = descriptions.length > 0
      ? descriptions.join('\n')
      : 'No additional abilities configured.';
    skillsDirMtimeMs = dirStat.mtimeMs;
    skillFileMtimes = newFileMtimes;
    return skillDescCache;
  } catch {
    skillDescCache = 'No additional abilities configured.';
    skillsDirMtimeMs = dirStat.mtimeMs;
    skillFileMtimes = null;
    return skillDescCache;
  }
}

/**
 * Resolve built-in variables like {{datetime}} and {{skills}}.
 * @param {string} content - Content with possible variable placeholders
 * @returns {Promise<string>} Content with variables resolved
 */
async function resolveVariables(content) {
  const matches = [...content.matchAll(VARIABLE_PATTERN)];
  if (matches.length === 0) return content;

  const now = new Date().toISOString();
  let result = content;
  for (const [match, variable] of matches) {
    let replacement;
    switch (variable.toLowerCase()) {
      case 'datetime':
        replacement = now;
        break;
      case 'skills':
        replacement = await loadSkillDescriptions();
        break;
      default:
        replacement = match;
    }
    result = result.replace(match, () => replacement);
  }
  return result;
}

/**
 * Render a markdown file, resolving {{filepath}} includes recursively
 * and {{datetime}}, {{skills}} built-in variables.
 * Referenced file paths resolve relative to the project root.
 * File content is cached with mtime validation (including transitive dependency mtimes);
 * variables are resolved fresh each call.
 * @param {string} filePath - Absolute path to the markdown file
 * @param {string[]} [chain=[]] - Already-resolved file paths (for circular detection)
 * @returns {Promise<string>} Rendered markdown content
 */
async function render_md(filePath, chain = []) {
  const resolved = path.resolve(filePath);

  if (chain.includes(resolved)) {
    const cycle = [...chain, resolved].map((p) => path.relative(PROJECT_ROOT, p)).join(' -> ');
    console.log(`[render_md] Circular include detected: ${cycle}`);
    return '';
  }

  // Check file existence and mtime
  let stat;
  try {
    stat = await fs.promises.stat(resolved);
  } catch {
    if (chain.length === 0) {
      console.warn(`[render_md] File not found: ${path.relative(PROJECT_ROOT, resolved)}`);
    }
    return '';
  }

  // Use cached content if mtime matches AND all dependency mtimes match (including transitive)
  const cached = cache.get(resolved);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.depMtimes.size > 0) {
    const depChecks = await Promise.all(
      [...cached.depMtimes.entries()].map(async ([depPath, depMtime]) => {
        try {
          const depStat = await fs.promises.stat(depPath);
          return depStat.mtimeMs === depMtime;
        } catch {
          return false; // Dependency deleted
        }
      })
    );
    if (depChecks.every(Boolean)) {
      return resolveVariables(cached.content);
    }
  } else if (cached && cached.mtimeMs === stat.mtimeMs && cached.depMtimes.size === 0) {
    // No dependencies — mtime match alone is sufficient
    return resolveVariables(cached.content);
  }

  const content = await fs.promises.readFile(resolved, 'utf8');
  const currentChain = [...chain, resolved];
  const depMtimes = new Map();

  // Resolve {{file.md}} includes — sequential for circular detection
  const matches = [...content.matchAll(INCLUDE_PATTERN)];
  let result = content;
  for (const [match, includePath] of matches) {
    const includeResolved = path.resolve(PROJECT_ROOT, includePath.trim());
    // Guard against path traversal outside project root
    const rel = path.relative(PROJECT_ROOT, includeResolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      continue;
    }
    // Check if include target exists before replacing — preserve placeholder if missing
    let includeStat;
    try {
      includeStat = await fs.promises.stat(includeResolved);
    } catch {
      console.warn(`[render_md] Missing include: {{${includePath.trim()}}} in ${path.relative(PROJECT_ROOT, resolved)}`);
      continue; // Leave {{file.md}} placeholder intact
    }
    depMtimes.set(includeResolved, includeStat.mtimeMs);
    const included = await render_md(includeResolved, currentChain);
    // Merge transitive dependencies from child into parent
    const childCache = cache.get(includeResolved);
    if (childCache) {
      for (const [k, v] of childCache.depMtimes) {
        depMtimes.set(k, v);
      }
    }
    result = result.replace(match, () => included);
  }

  cache.set(resolved, { mtimeMs: stat.mtimeMs, depMtimes, content: result });

  // Variables resolved fresh each call ({{datetime}} must not be cached)
  return resolveVariables(result);
}

export { render_md };
