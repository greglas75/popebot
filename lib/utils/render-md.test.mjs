import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs', () => {
  const promises = {
    stat: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
  };
  return { default: { promises }, promises };
});

vi.mock('../paths.js', () => ({ PROJECT_ROOT: '/project' }));

const fs = (await import('fs')).default;
const { render_md, clearRenderCache } = await import('./render-md.js');

// --- Helpers ---

function makeStat(mtimeMs = 1000) {
  return { mtimeMs };
}

function makeDirEntry(name, { isDir = true, isSymLink = false } = {}) {
  return {
    name,
    isDirectory: () => isDir,
    isSymbolicLink: () => isSymLink,
  };
}

const ACTIVE_DIR = '/project/skills/active';

function setupSkillsEnv({ skills = [], activeDirMtime = 2000 } = {}) {
  const entries = skills.map((s) => makeDirEntry(s.name, s.entryOpts));

  fs.promises.stat.mockImplementation(async (p) => {
    if (p === '/project/test.md') return makeStat(1000);
    if (p === ACTIVE_DIR) return makeStat(activeDirMtime);
    for (const s of skills) {
      const mdPath = `${ACTIVE_DIR}/${s.name}/SKILL.md`;
      if (p === mdPath) {
        if (s.noStat) throw new Error('ENOENT');
        return makeStat(s.mtime ?? 3000);
      }
    }
    throw new Error('ENOENT');
  });

  fs.promises.readFile.mockImplementation(async (p) => {
    if (p === '/project/test.md') return '{{skills}}';
    for (const s of skills) {
      const mdPath = `${ACTIVE_DIR}/${s.name}/SKILL.md`;
      if (p === mdPath) return s.content;
    }
    throw new Error('ENOENT');
  });

  fs.promises.readdir.mockResolvedValue(entries);
}

// --- Setup / Teardown ---

let logSpy, warnSpy;

beforeEach(() => {
  clearRenderCache();
  vi.resetAllMocks();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  vi.useRealTimers();
});

// --- Tests ---

describe('render_md', () => {
  describe('basic rendering', () => {
    it('renders a plain markdown file', async () => {
      fs.promises.stat.mockResolvedValue(makeStat());
      fs.promises.readFile.mockResolvedValue('Hello world');

      const result = await render_md('/project/test.md');

      expect(result).toBe('Hello world');
      expect(fs.promises.stat).toHaveBeenCalledWith('/project/test.md');
      expect(fs.promises.readFile).toHaveBeenCalledWith('/project/test.md', 'utf8');
      expect(fs.promises.readdir).not.toHaveBeenCalled();
    });

    it('returns empty string when root file does not exist', async () => {
      fs.promises.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await render_md('/project/missing.md');

      expect(result).toBe('');
      expect(fs.promises.readFile).not.toHaveBeenCalled();
    });

    it('logs warning when root file not found', async () => {
      fs.promises.stat.mockRejectedValue(new Error('ENOENT'));

      await render_md('/project/missing.md');

      expect(warnSpy).toHaveBeenCalledWith(
        '[render_md] File not found: missing.md',
      );
    });

    it('propagates readFile error when file exists but cannot be read', async () => {
      fs.promises.stat.mockResolvedValue(makeStat());
      fs.promises.readFile.mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(render_md('/project/test.md')).rejects.toThrow(
        'EACCES: permission denied',
      );
    });

    it('returns empty silently when nested include file not found', async () => {
      fs.promises.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await render_md('/project/nested.md', ['/project/parent.md']);

      expect(result).toBe('');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('variable resolution', () => {
    it('resolves {{datetime}} to current ISO date string', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
      fs.promises.stat.mockResolvedValue(makeStat());
      fs.promises.readFile.mockResolvedValue('Today is {{datetime}}');

      const result = await render_md('/project/test.md');

      expect(result).toBe('Today is 2026-01-15T12:00:00.000Z');
    });

    it('handles case-insensitive variable names', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
      fs.promises.stat.mockResolvedValue(makeStat());
      fs.promises.readFile.mockResolvedValue('{{DATETIME}} and {{DateTime}}');

      const result = await render_md('/project/test.md');

      expect(result).toBe('2026-01-15T12:00:00.000Z and 2026-01-15T12:00:00.000Z');
    });

    it('returns content unchanged when no variables or includes present', async () => {
      fs.promises.stat.mockResolvedValue(makeStat());
      fs.promises.readFile.mockResolvedValue('No variables here');

      const result = await render_md('/project/test.md');

      expect(result).toBe('No variables here');
    });

    it('resolves {{skills}} to skill descriptions from active skills', async () => {
      setupSkillsEnv({
        skills: [
          { name: 'my-skill', content: '---\nname: my-skill\ndescription: Automates testing\n---\nBody' },
        ],
      });

      const result = await render_md('/project/test.md');

      expect(result).toBe('- Automates testing');
    });

    it('returns fallback when skills/active directory is missing', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/test.md') return makeStat();
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockResolvedValue('{{skills}}');

      const result = await render_md('/project/test.md');

      expect(result).toBe('No additional abilities configured.');
    });
  });

  describe('file includes', () => {
    it('resolves {{file.md}} includes with target content', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/main.md' || p === '/project/header.md') return makeStat();
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/main.md') return 'Before {{header.md}} After';
        if (p === '/project/header.md') return 'HEADER';
        throw new Error('ENOENT');
      });

      const result = await render_md('/project/main.md');

      expect(result).toBe('Before HEADER After');
    });

    it('resolves multiple includes in the same file', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (['/project/main.md', '/project/a.md', '/project/b.md'].includes(p))
          return makeStat();
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/main.md') return '{{a.md}} and {{b.md}}';
        if (p === '/project/a.md') return 'AAA';
        if (p === '/project/b.md') return 'BBB';
        throw new Error('ENOENT');
      });

      const result = await render_md('/project/main.md');

      expect(result).toBe('AAA and BBB');
    });

    it('resolves nested includes recursively', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (['/project/a.md', '/project/b.md', '/project/c.md'].includes(p))
          return makeStat();
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/a.md') return 'A[{{b.md}}]';
        if (p === '/project/b.md') return 'B[{{c.md}}]';
        if (p === '/project/c.md') return 'C';
        throw new Error('ENOENT');
      });

      const result = await render_md('/project/a.md');

      expect(result).toBe('A[B[C]]');
    });

    it('detects circular includes and returns empty for the cycle', async () => {
      fs.promises.stat.mockResolvedValue(makeStat());
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/a.md') return '{{b.md}}';
        if (p === '/project/b.md') return '{{a.md}}';
        return '';
      });

      const result = await render_md('/project/a.md');

      expect(result).toBe('');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circular include detected'),
      );
    });

    it('logs the circular include cycle path with relative paths', async () => {
      fs.promises.stat.mockResolvedValue(makeStat());
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/a.md') return '{{b.md}}';
        if (p === '/project/b.md') return '{{a.md}}';
        return '';
      });

      await render_md('/project/a.md');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/a\.md -> b\.md -> a\.md/),
      );
    });

    it('preserves placeholder and warns when include target is missing', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/main.md') return makeStat();
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockResolvedValue('Before {{missing.md}} After');

      const result = await render_md('/project/main.md');

      expect(result).toBe('Before {{missing.md}} After');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing include: {{missing.md}}'),
      );
    });

    it('blocks path traversal outside project root', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/main.md') return makeStat();
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockResolvedValue('{{../../outside.md}}');

      const result = await render_md('/project/main.md');

      // Traversal include is silently skipped, placeholder preserved
      expect(result).toBe('{{../../outside.md}}');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('returns cached content on second call when mtime unchanged', async () => {
      fs.promises.stat.mockResolvedValue(makeStat(1000));
      fs.promises.readFile.mockResolvedValue('Cached content');

      await render_md('/project/test.md');
      const result = await render_md('/project/test.md');

      expect(result).toBe('Cached content');
      expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache when file mtime changes', async () => {
      fs.promises.stat.mockResolvedValue(makeStat(1000));
      fs.promises.readFile.mockResolvedValue('Original');
      await render_md('/project/test.md');

      fs.promises.stat.mockResolvedValue(makeStat(2000));
      fs.promises.readFile.mockResolvedValue('Updated');
      const result = await render_md('/project/test.md');

      expect(result).toBe('Updated');
      expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
    });

    it('returns cached content with deps when all dependency mtimes match', async () => {
      // First call: main.md includes dep.md
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/main.md' || p === '/project/dep.md')
          return makeStat(1000);
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/main.md') return '{{dep.md}}';
        if (p === '/project/dep.md') return 'DEP CONTENT';
        throw new Error('ENOENT');
      });
      await render_md('/project/main.md');

      // Second call: all mtimes unchanged → cache hit with deps
      const result = await render_md('/project/main.md');

      expect(result).toBe('DEP CONTENT');
      // readFile called twice for first call (main + dep), zero for second
      expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
    });

    it('invalidates cache when dependency is deleted between calls', async () => {
      // First call: main.md includes dep.md
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/main.md' || p === '/project/dep.md')
          return makeStat(1000);
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/main.md') return '{{dep.md}}';
        if (p === '/project/dep.md') return 'DEP EXISTS';
        throw new Error('ENOENT');
      });
      await render_md('/project/main.md');

      // Second call: dep.md deleted → stat throws → cache invalidated
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/main.md') return makeStat(1000);
        throw new Error('ENOENT'); // dep.md no longer exists
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/main.md') return '{{dep.md}}';
        throw new Error('ENOENT');
      });
      const result = await render_md('/project/main.md');

      // dep.md missing → include preserved as placeholder
      expect(result).toBe('{{dep.md}}');
    });

    it('invalidates cache when dependency mtime changes', async () => {
      // First call: main.md includes dep.md, both at mtime 1000
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/main.md' || p === '/project/dep.md')
          return makeStat(1000);
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/main.md') return '{{dep.md}}';
        if (p === '/project/dep.md') return 'DEP v1';
        throw new Error('ENOENT');
      });
      const result1 = await render_md('/project/main.md');
      expect(result1).toBe('DEP v1');

      // Second call: main.md unchanged, dep.md mtime changed
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/main.md') return makeStat(1000);
        if (p === '/project/dep.md') return makeStat(2000);
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/main.md') return '{{dep.md}}';
        if (p === '/project/dep.md') return 'DEP v2';
        throw new Error('ENOENT');
      });
      const result2 = await render_md('/project/main.md');

      expect(result2).toBe('DEP v2');
    });

    it('resolves variables fresh on every call even when content is cached', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      fs.promises.stat.mockResolvedValue(makeStat(1000));
      fs.promises.readFile.mockResolvedValue('Time: {{datetime}}');

      const result1 = await render_md('/project/test.md');
      expect(result1).toBe('Time: 2026-01-01T00:00:00.000Z');

      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
      const result2 = await render_md('/project/test.md');

      expect(result2).toBe('Time: 2026-06-15T12:00:00.000Z');
      // readFile called only once — second call used cache
      expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearRenderCache', () => {
    it('forces re-read after clearing cache', async () => {
      fs.promises.stat.mockResolvedValue(makeStat(1000));
      fs.promises.readFile.mockResolvedValue('Original');
      await render_md('/project/test.md');

      clearRenderCache();
      fs.promises.readFile.mockResolvedValue('After clear');
      const result = await render_md('/project/test.md');

      expect(result).toBe('After clear');
      expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
    });

    it('resets skill cache so next skills call re-scans directory', async () => {
      // First call with skills
      setupSkillsEnv({
        skills: [
          { name: 'old-skill', content: '---\nname: os\ndescription: Old skill\n---\n' },
        ],
      });
      const result1 = await render_md('/project/test.md');
      expect(result1).toBe('- Old skill');

      clearRenderCache();

      // Re-setup with different skills
      setupSkillsEnv({
        skills: [
          { name: 'new-skill', content: '---\nname: ns\ndescription: New skill\n---\n' },
        ],
      });
      const result2 = await render_md('/project/test.md');

      expect(result2).toBe('- New skill');
      // readdir called twice — once before clear, once after
      expect(fs.promises.readdir).toHaveBeenCalledTimes(2);
    });
  });

  describe('loadSkillDescriptions (via {{skills}})', () => {
    it('joins multiple skill descriptions as bullet list', async () => {
      setupSkillsEnv({
        skills: [
          { name: 'alpha', content: '---\nname: alpha\ndescription: Does A\n---\n' },
          { name: 'beta', content: '---\nname: beta\ndescription: Does B\n---\n' },
        ],
      });

      const result = await render_md('/project/test.md');

      expect(result).toBe('- Does A\n- Does B');
      expect(fs.promises.readdir).toHaveBeenCalledWith(
        ACTIVE_DIR,
        expect.objectContaining({ withFileTypes: true }),
      );
    });

    it('returns cached skills without re-scanning when directory unchanged', async () => {
      setupSkillsEnv({
        skills: [
          { name: 'cached', content: '---\nname: c\ndescription: Cached skill\n---\n' },
        ],
      });

      await render_md('/project/test.md');
      expect(fs.promises.readdir).toHaveBeenCalledTimes(1);

      // Second call — both file cache and skill cache should hit
      const result = await render_md('/project/test.md');

      expect(result).toBe('- Cached skill');
      expect(fs.promises.readdir).toHaveBeenCalledTimes(1);
    });

    it('re-scans when skill file mtime changes', async () => {
      setupSkillsEnv({
        skills: [
          { name: 'evolving', content: '---\nname: e\ndescription: Version 1\n---\n', mtime: 3000 },
        ],
      });
      await render_md('/project/test.md');

      // Update skill file mtime and content
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/test.md') return makeStat(1000);
        if (p === ACTIVE_DIR) return makeStat(2000);
        if (p === `${ACTIVE_DIR}/evolving/SKILL.md`) return makeStat(4000);
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/test.md') return '{{skills}}';
        if (p === `${ACTIVE_DIR}/evolving/SKILL.md`)
          return '---\nname: e\ndescription: Version 2\n---\n';
        throw new Error('ENOENT');
      });

      const result = await render_md('/project/test.md');

      expect(result).toBe('- Version 2');
      expect(fs.promises.readdir).toHaveBeenCalledTimes(2);
    });

    it('re-scans when tracked skill file is deleted', async () => {
      setupSkillsEnv({
        skills: [
          { name: 'doomed', content: '---\nname: d\ndescription: Soon gone\n---\n', mtime: 3000 },
        ],
      });
      await render_md('/project/test.md');
      expect(fs.promises.readdir).toHaveBeenCalledTimes(1);

      // Skill file deleted — stat throws for the tracked SKILL.md path
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/test.md') return makeStat(1000);
        if (p === ACTIVE_DIR) return makeStat(2000); // same dir mtime
        throw new Error('ENOENT'); // SKILL.md deleted
      });
      fs.promises.readFile.mockResolvedValue('{{skills}}');
      fs.promises.readdir.mockResolvedValue([]); // empty after deletion

      const result = await render_md('/project/test.md');

      expect(result).toBe('No additional abilities configured.');
      expect(fs.promises.readdir).toHaveBeenCalledTimes(2);
    });

    it('skips non-directory non-symlink entries', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/test.md') return makeStat();
        if (p === ACTIVE_DIR) return makeStat(2000);
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockResolvedValue('{{skills}}');
      fs.promises.readdir.mockResolvedValue([
        makeDirEntry('README.md', { isDir: false }),
      ]);

      const result = await render_md('/project/test.md');

      expect(result).toBe('No additional abilities configured.');
    });

    it('handles symlink entries as valid skill directories', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/test.md') return makeStat();
        if (p === ACTIVE_DIR) return makeStat(2000);
        if (p === `${ACTIVE_DIR}/linked/SKILL.md`) return makeStat(3000);
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockImplementation(async (p) => {
        if (p === '/project/test.md') return '{{skills}}';
        if (p === `${ACTIVE_DIR}/linked/SKILL.md`)
          return '---\nname: l\ndescription: Linked skill\n---\n';
        throw new Error('ENOENT');
      });
      fs.promises.readdir.mockResolvedValue([
        makeDirEntry('linked', { isDir: false, isSymLink: true }),
      ]);

      const result = await render_md('/project/test.md');

      expect(result).toBe('- Linked skill');
    });

    it('skips SKILL.md without valid frontmatter', async () => {
      setupSkillsEnv({
        skills: [{ name: 'no-fm', content: 'Just plain content, no frontmatter delimiters' }],
      });

      const result = await render_md('/project/test.md');

      expect(result).toBe('No additional abilities configured.');
    });

    it('skips SKILL.md without description field in frontmatter', async () => {
      setupSkillsEnv({
        skills: [{ name: 'no-desc', content: '---\nname: no-desc\nversion: 1\n---\nBody' }],
      });

      const result = await render_md('/project/test.md');

      expect(result).toBe('No additional abilities configured.');
    });

    it('returns fallback when readdir throws', async () => {
      fs.promises.stat.mockImplementation(async (p) => {
        if (p === '/project/test.md') return makeStat();
        if (p === ACTIVE_DIR) return makeStat(2000);
        throw new Error('ENOENT');
      });
      fs.promises.readFile.mockResolvedValue('{{skills}}');
      fs.promises.readdir.mockRejectedValue(new Error('EACCES'));

      const result = await render_md('/project/test.md');

      expect(result).toBe('No additional abilities configured.');
    });
  });
});
