import { describe, expect, it } from 'vitest';
import { formatColombo } from './time';

describe('formatColombo', () => {
  it('converts UTC to Asia/Colombo (+05:30)', () => {
    expect(formatColombo('2026-01-15T00:00:00Z', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('05:30');
  });
  it('handles offset input', () => {
    expect(formatColombo('2026-01-15T09:30:00+05:30', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('09:30');
  });
  it('returns empty string for invalid input', () => {
    expect(formatColombo('nope')).toBe('');
  });
});
