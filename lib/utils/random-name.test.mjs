import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateRandomName } from './random-name.js';

describe('generateRandomName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a string in the format adjective-surname', () => {
    const name = generateRandomName();
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('returns different names on successive calls (non-deterministic)', () => {
    // With 100+ adjectives × 200+ surnames, collision in 20 tries is astronomically unlikely
    const names = new Set();
    for (let i = 0; i < 20; i++) {
      names.add(generateRandomName());
    }
    expect(names.size).toBeGreaterThan(1);
  });

  it('produces a specific name when Math.random is controlled', () => {
    // Mock Math.random to always return 0 → first adjective + first surname
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const name = generateRandomName();
    // First adjective: 'admiring', first surname: 'albattani'
    expect(name).toBe('admiring-albattani');
  });

  it('produces last entries when Math.random returns near 1', () => {
    // 0.999... maps to last index via Math.floor
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const name = generateRandomName();
    // Last adjective: 'zen', last surname: 'zhukovsky'
    expect(name).toBe('zen-zhukovsky');
  });

  it('always contains exactly one hyphen separator', () => {
    for (let i = 0; i < 10; i++) {
      const name = generateRandomName();
      const hyphens = (name.match(/-/g) || []).length;
      expect(hyphens).toBe(1);
    }
  });
});
