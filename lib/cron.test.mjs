import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy dependencies before import
vi.mock('node-cron', () => ({
  default: { schedule: vi.fn(), validate: vi.fn(() => true) },
}));
vi.mock('./actions.js', () => ({ executeAction: vi.fn() }));
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
  },
}));

const {
  isPrerelease,
  getUpdateAvailable,
  setUpdateAvailable,
  getInstalledVersion,
  isVersionNewer,
  compareVersions,
} = await import('./cron.js');
const fs = (await import('fs')).default;

beforeEach(() => {
  vi.clearAllMocks();
  setUpdateAvailable(null);
});

describe('isPrerelease', () => {
  it('returns true for beta versions', () => {
    expect(isPrerelease('1.2.71-beta.0')).toBe(true);
  });

  it('returns true for rc versions', () => {
    expect(isPrerelease('2.0.0-rc.1')).toBe(true);
  });

  it('returns true for alpha versions', () => {
    expect(isPrerelease('1.0.0-alpha')).toBe(true);
  });

  it('returns false for stable versions', () => {
    expect(isPrerelease('1.2.75')).toBe(false);
  });

  it('returns false for simple major.minor.patch', () => {
    expect(isPrerelease('0.0.1')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isPrerelease('')).toBe(false);
  });
});

describe('getUpdateAvailable / setUpdateAvailable', () => {
  it('returns null by default', () => {
    expect(getUpdateAvailable()).toBeNull();
  });

  it('returns the version after set', () => {
    setUpdateAvailable('1.3.0');
    expect(getUpdateAvailable()).toBe('1.3.0');
  });

  it('can be cleared back to null', () => {
    setUpdateAvailable('2.0.0');
    setUpdateAvailable(null);
    expect(getUpdateAvailable()).toBeNull();
  });

  it('overwrites previous value', () => {
    setUpdateAvailable('1.0.0');
    setUpdateAvailable('2.0.0');
    expect(getUpdateAvailable()).toBe('2.0.0');
  });
});

describe('isVersionNewer', () => {
  it('returns true when candidate patch is greater (stable)', () => {
    expect(isVersionNewer('1.2.40', '1.2.39')).toBe(true);
  });

  it('returns false when candidate is older', () => {
    expect(isVersionNewer('1.0.0', '2.0.0')).toBe(false);
  });

  it('returns false when versions are equal', () => {
    expect(isVersionNewer('1.0.0', '1.0.0')).toBe(false);
  });

  it('returns false when candidate is a pre-release (never newer for upgrades)', () => {
    expect(isVersionNewer('2.0.0-rc.1', '1.0.0')).toBe(false);
  });

  it('compares against baseline core when baseline has pre-release suffix', () => {
    expect(isVersionNewer('2.0.0', '1.0.0-beta.0')).toBe(true);
  });
});

describe('compareVersions', () => {
  it('returns negative when a < b (stable)', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('returns positive when a > b (stable)', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('returns 0 when stable versions are equal', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('orders pre-releases before stable for same core', () => {
    expect(compareVersions('1.2.71-beta.0', '1.2.71')).toBeLessThan(0);
    expect(compareVersions('1.2.71', '1.2.71-beta.0')).toBeGreaterThan(0);
  });

  it('orders beta tags numerically when core matches', () => {
    expect(compareVersions('1.2.71-beta.0', '1.2.71-beta.1')).toBeLessThan(0);
  });
});

describe('getInstalledVersion', () => {
  it('reads version from node_modules/thepopebot/package.json', () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ version: '1.2.75' }));
    expect(getInstalledVersion()).toBe('1.2.75');
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('node_modules/thepopebot/package.json'),
      'utf8',
    );
  });

  it('throws when package.json is missing', () => {
    fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(() => getInstalledVersion()).toThrow('ENOENT');
  });

  it('throws on invalid JSON', () => {
    fs.readFileSync.mockReturnValue('not json');
    expect(() => getInstalledVersion()).toThrow();
  });
});
