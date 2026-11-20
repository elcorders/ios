import { describe, expect, it } from 'vitest';
import type { KioskFeed, KioskSession } from '../api/types';
import { colomboAt, colomboHM, countdown, demoParam, formatCode, inActiveWindow, isWellFormedCode, nextBoundary, nextCheckAt, normaliseCode, refreshTap, shortLabel, withinHours } from './kiosk';

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

describe('S21.F4 check schedule', () => {
  const H = { open: '08:00', close: '17:00' };
  const at = (hm: string, date = '2026-11-21') => colomboAt(date, hm);
  it('active window is lab hours ± 30 min', () => {
    expect(inActiveWindow(at('07:29'), H)).toBe(false);
    expect(inActiveWindow(at('07:30'), H)).toBe(true);
    expect(inActiveWindow(at('17:29'), H)).toBe(true);
    expect(inActiveWindow(at('17:30'), H)).toBe(false);
    expect(inActiveWindow(at('12:00'), null)).toBe(false);
  });
  it('every 15 min inside, window start before it, 00:05 tomorrow after it or on a closed day', () => {
    expect(nextCheckAt(at('10:00'), H)).toBe(at('10:15'));
    expect(nextCheckAt(at('10:00'), H, 120_000)).toBe(at('10:02'));
    expect(nextCheckAt(at('06:00'), H)).toBe(at('07:30'));
    expect(nextCheckAt(at('17:20'), H)).toBe(at('00:05', '2026-11-22'));
    expect(nextCheckAt(at('20:00'), H)).toBe(at('00:05', '2026-11-22'));
    expect(nextCheckAt(at('09:00'), null)).toBe(at('00:05', '2026-11-22'));
    expect(nextCheckAt(at('00:01'), null)).toBe(at('00:05'));
  });
  it('manual refresh backs off 30 s → 15 min and resets after 15 min quiet', () => {
    let r = refreshTap(null, 0);
    expect(r.until).toBe(30_000);
    const seen = [r.until - r.lastTap];
    for (let i = 0; i < 6; i++) {
      r = refreshTap(r, r.until);
      seen.push(r.until - r.lastTap);
    }
    expect(seen).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000]);
    expect(refreshTap(r, r.until + 15 * 60_000 - 1).level).toBe(5);
    expect(refreshTap(r, r.until + 15 * 60_000).level).toBe(0);
  });
});
