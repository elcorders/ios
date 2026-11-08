import { describe, expect, it } from 'vitest';
import { colomboLocalToIso, isoToColomboLocal } from './colomboLocal';

describe('colomboLocal', () => {
  it('adds the +05:30 offset regardless of browser zone', () => {
    expect(colomboLocalToIso('2026-03-05T09:30')).toBe('2026-03-05T09:30:00+05:30');
    expect(new Date(colomboLocalToIso('2026-03-05T09:30')!).toISOString()).toBe('2026-03-05T04:00:00.000Z');
  });
  it('rejects bad values', () => {
    expect(colomboLocalToIso('')).toBeNull();
    expect(colomboLocalToIso('2026-02-31T10:00')).toBeNull();
    expect(colomboLocalToIso('2026-03-05')).toBeNull();
    expect(colomboLocalToIso('2026-03-05T25:00')).toBeNull();
  });
  it('round-trips through an ISO instant', () => {
    expect(isoToColomboLocal('2026-03-05T04:00:00.000Z')).toBe('2026-03-05T09:30');
    expect(isoToColomboLocal('2026-03-05T23:00:00Z')).toBe('2026-03-06T04:30');
    expect(isoToColomboLocal('nope')).toBe('');
  });
});
