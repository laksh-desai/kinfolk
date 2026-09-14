import { describe, expect, it } from 'vitest';
import { relativeTime } from './relativeTime';

describe('relativeTime', () => {
  const now = Date.parse('2026-09-14T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('reads naturally at every scale', () => {
    expect(relativeTime(ago(10_000), now)).toBe('just now');
    expect(relativeTime(ago(60_000), now)).toBe('1 minute ago');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 minutes ago');
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3 hours ago');
    expect(relativeTime(ago(30 * 3_600_000), now)).toBe('yesterday');
    expect(relativeTime(ago(4 * 86_400_000), now)).toBe('4 days ago');
    expect(relativeTime(ago(21 * 86_400_000), now)).toBe('3 weeks ago');
    expect(relativeTime(ago(95 * 86_400_000), now)).toBe('3 months ago');
    expect(relativeTime('2024-02-03T10:00:00.000Z', now)).toBe('3 Feb 2024');
  });

  it('never shows a time in the future', () => {
    expect(relativeTime(new Date(now + 5_000).toISOString(), now)).toBe('just now');
  });
});
