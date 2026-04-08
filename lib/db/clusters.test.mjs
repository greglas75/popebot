import { describe, it, expect } from 'vitest';
import { roleShortId } from './clusters.js';

describe('roleShortId', () => {
  it('removes hyphens and takes first 8 chars of UUID', () => {
    // a1b2c3d4-e5f6-7890-abcd-ef1234567890 → a1b2c3d4e5f67890... → a1b2c3d4
    expect(roleShortId({ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })).toBe('a1b2c3d4');
  });

  it('handles UUID with all zeros', () => {
    expect(roleShortId({ id: '00000000-0000-0000-0000-000000000000' })).toBe('00000000');
  });

  it('handles ID without hyphens', () => {
    expect(roleShortId({ id: 'abcdef1234567890' })).toBe('abcdef12');
  });

  it('handles short ID (fewer than 8 chars after strip)', () => {
    expect(roleShortId({ id: 'ab-cd' })).toBe('abcd');
  });

  it('returns empty string for empty ID', () => {
    expect(roleShortId({ id: '' })).toBe('');
  });

  it('returns first 8 chars of hyphen-only input (empty after strip)', () => {
    expect(roleShortId({ id: '---' })).toBe('');
  });
});
