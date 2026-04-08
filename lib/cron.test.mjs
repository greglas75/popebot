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

// NOTE: isVersionNewer and compareVersions contain critical semver logic but
// are NOT exported. Testing them requires either exporting (production change)
// or testing indirectly through runVersionCheck (requires npm registry + DB mocking).
// Tracked as coverage gap for future improvement.

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
