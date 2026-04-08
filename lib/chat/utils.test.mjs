import { describe, it, expect } from 'vitest';
import { cn } from './utils.js';

describe('cn', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes via clsx', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('resolves Tailwind conflicts (last wins)', () => {
    // twMerge resolves p-4 + p-2 → p-2
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('resolves conflicting text colors', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('preserves non-conflicting classes', () => {
    expect(cn('p-4', 'mt-2', 'text-sm')).toBe('p-4 mt-2 text-sm');
  });

  it('handles empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
  });

  it('handles undefined and null inputs', () => {
    expect(cn(undefined, 'foo', null)).toBe('foo');
  });

  it('handles array inputs via clsx', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  it('handles object inputs via clsx', () => {
    expect(cn({ hidden: true, visible: false })).toBe('hidden');
  });
});
