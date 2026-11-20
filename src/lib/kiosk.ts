import type { KioskFeed } from '../api/types';

/** Pure helpers for the lab kiosk (CONTRACT §S21). Times are Asia/Colombo (UTC+05:30, no DST). */

const OFFSET_MS = 5.5 * 3_600_000;
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** Normalise a typed pairing code: uppercase, drop spaces/dashes, I/L → 1, O → 0. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}
/** True when the (normalised) code is 8 Crockford base32 characters. */
export const isWellFormedCode = (input: string): boolean => CODE_RE.test(normaliseCode(input));
/** `ABCD2345` → `ABCD-2345` (anything else is returned as typed, uppercased). */
export function formatCode(code: string): string {
  const c = normaliseCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : code.toUpperCase();
}

/** Short person label (matches the server rule): `COBSCCOMP251P-0NN` → `251P-0NN`, else "Amal P.", else "Student". */
export function shortLabel(indexNo: string | null, first: string | null, last: string | null): string {
  const m = /(\d+[A-Za-z]+-\d+)$/.exec(indexNo?.trim() ?? '');
  if (m) return m[1]!.toUpperCase();
  const f = first?.trim();
  if (f) {
    const l = last?.trim();
    return l ? `${f} ${l[0]!.toUpperCase()}.` : f;
  }
  return 'Student';
}

export const colomboDate = (ms: number): string => new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
export const colomboHM = (ms: number): string => new Date(ms + OFFSET_MS).toISOString().slice(11, 16);
const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
/** Instant of `HH:MM` on a Colombo date. */
export const colomboAt = (date: string, hm: string): number => Date.parse(`${date}T${hm}:00+05:30`);

/** Is `ms` within [open, close) of today's lab hours? */
export function withinHours(ms: number, hours: { open: string; close: string } | null): boolean {
  if (!hours) return false;
  const m = minutes(colomboHM(ms));
  return m >= minutes(hours.open) && m < minutes(hours.close);
}

/** S21.F4: scheduled checks every 15 min, only within lab hours ± 30 min (CONTRACT §S21). */
export const CHECK_EVERY_MS = 15 * 60_000;
export const ACTIVE_PAD_MIN = 30;
const MIDNIGHT_CHECK_MIN = 5;

/** Is `ms` within [open − pad, close + pad) of today's lab hours? */
export function inActiveWindow(ms: number, hours: { open: string; close: string } | null, pad = ACTIVE_PAD_MIN): boolean {
  if (!hours) return false;
  const m = minutes(colomboHM(ms));
  return m >= minutes(hours.open) - pad && m < minutes(hours.close) + pad;
}

/**
 * When the next scheduled feed check should run. Inside the window: `every` from now (sooner after a failure).
 * Outside: the window start later today, else 00:05 Colombo tomorrow (one check to learn the new day's hours).
 */
export function nextCheckAt(ms: number, hours: { open: string; close: string } | null, every = CHECK_EVERY_MS): number {
  const today = colomboDate(ms);
  if (hours) {
    const start = colomboAt(today, hours.open) - ACTIVE_PAD_MIN * 60_000;
    const end = colomboAt(today, hours.close) + ACTIVE_PAD_MIN * 60_000;
    if (ms < start) return start;
    if (ms + every < end) return ms + every;
  }
  const todayCheck = colomboAt(today, '00:00') + MIDNIGHT_CHECK_MIN * 60_000;
  if (ms < todayCheck) return todayCheck;
  return colomboAt(colomboDate(ms + 86_400_000), '00:00') + MIDNIGHT_CHECK_MIN * 60_000;
}

/** Manual refresh back-off: 30 s → 1 → 2 → 4 → 8 → 15 min; back to 30 s after 15 min quiet (counted from the end of the last cooldown). */
export const REFRESH_STEPS_MS = [30_000, 60_000, 120_000, 240_000, 480_000, 900_000] as const;
export interface RefreshState { level: number; lastTap: number; until: number }
export function refreshTap(prev: RefreshState | null, now: number): RefreshState {
  const level = prev && now - prev.until < 15 * 60_000 ? Math.min(prev.level + 1, REFRESH_STEPS_MS.length - 1) : 0;
  return { level, lastTap: now, until: now + REFRESH_STEPS_MS[level]! };
}

/** Next session slot start or end (today, after `now`) so the feed can refresh when it flips; null when none. */
export function nextBoundary(feed: KioskFeed, now: number): number | null {
  const today = colomboDate(now);
  let best: number | null = null;
  for (const s of [feed.session_now, feed.next_session]) {
    if (!s || s.date !== today) continue;
    for (const slot of s.slots) {
      for (const hm of [slot.start_time, slot.end_time]) {
        const t = colomboAt(s.date, hm);
        if (t > now && (best === null || t < best)) best = t;
      }
    }
  }
  return best;
}

/** Remaining time as `m:ss`. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** `?demo=class|lab` of the current hash route (mock demo switch), else null. */
export function demoParam(hash: string = typeof location === 'undefined' ? '' : location.hash): 'class' | 'lab' | null {
  const q = hash.split('?')[1];
  const v = q ? new URLSearchParams(q).get('demo') : null;
  return v === 'class' || v === 'lab' ? v : null;
}
