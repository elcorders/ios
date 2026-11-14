import { describe, expect, it } from 'vitest';
import type { KioskFeed, KioskSession } from '../api/types';
import { colomboHM, countdown, demoParam, formatCode, isWellFormedCode, nextBoundary, normaliseCode, shortLabel, withinHours } from './kiosk';

describe('pairing code', () => {
  it('normalises per the contract', () => {
    expect(normaliseCode(' abcd-2o3l ')).toBe('ABCD2031');
    expect(normaliseCode('Ilil-OOoo')).toBe('11110000');
  });
  it('formats as XXXX-XXXX and checks the alphabet', () => {
    expect(formatCode('abcd2345')).toBe('ABCD-2345');
    expect(isWellFormedCode('abcd-2345')).toBe(true);
    expect(isWellFormedCode('ABCD234')).toBe(false);
    expect(isWellFormedCode('ABCD234U')).toBe(false); // U is not Crockford
  });
});

describe('shortLabel', () => {
  it('takes the trailing batch-sequence of the index', () => {
    expect(shortLabel('COBSCCOMP251P-007', 'Test', 'Student')).toBe('251P-007');
    expect(shortLabel('cobsccomp251p-012', null, null)).toBe('251P-012');
  });
  it('falls back to first name + last initial, then "Student"', () => {
    expect(shortLabel(null, 'Amal', 'Perera')).toBe('Amal P.');
    expect(shortLabel('nonsense', 'Amal', null)).toBe('Amal');
    expect(shortLabel(null, null, null)).toBe('Student');
  });
});

describe('time helpers (Asia/Colombo)', () => {
  const at = (iso: string) => Date.parse(iso);
  it('reads Colombo wall time', () => {
    expect(colomboHM(at('2026-11-14T09:30:00+05:30'))).toBe('09:30');
    expect(colomboHM(at('2026-11-14T00:10:00Z'))).toBe('05:40');
  });
  it('within lab hours is [open, close)', () => {
    const h = { open: '09:00', close: '19:00' };
    expect(withinHours(at('2026-11-14T09:00:00+05:30'), h)).toBe(true);
    expect(withinHours(at('2026-11-14T18:59:00+05:30'), h)).toBe(true);
    expect(withinHours(at('2026-11-14T19:00:00+05:30'), h)).toBe(false);
    expect(withinHours(at('2026-11-14T12:00:00+05:30'), null)).toBe(false);
  });
  it('countdown shows m:ss', () => {
    expect(countdown(9 * 60_000 + 5_000)).toBe('9:05');
    expect(countdown(-5)).toBe('0:00');
  });
  it('finds the next slot boundary today', () => {
    const session = (date: string, slots: [string, string][]): KioskSession => ({
      id: 's', title: 't', date, deliverables: [], content: [], slots: slots.map(([a, b]) => ({ start_time: a, end_time: b, group_nos: [1], now: false })),
    });
    const feed = {
      session_now: session('2026-11-14', [['09:00', '12:00'], ['13:00', '16:00']]),
      next_session: session('2026-11-15', [['09:00', '10:00']]),
    } as unknown as KioskFeed;
    expect(nextBoundary(feed, at('2026-11-14T10:00:00+05:30'))).toBe(at('2026-11-14T12:00:00+05:30'));
    expect(nextBoundary(feed, at('2026-11-14T12:30:00+05:30'))).toBe(at('2026-11-14T13:00:00+05:30'));
    expect(nextBoundary(feed, at('2026-11-14T17:00:00+05:30'))).toBeNull();
  });
});

describe('demoParam', () => {
  it('reads ?demo= from the hash route', () => {
    expect(demoParam('#/kiosk?demo=class')).toBe('class');
    expect(demoParam('#/kiosk?x=1&demo=lab')).toBe('lab');
    expect(demoParam('#/kiosk?demo=other')).toBeNull();
    expect(demoParam('#/kiosk')).toBeNull();
  });
});
