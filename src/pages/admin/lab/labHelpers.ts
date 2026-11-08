import type { ClosureInput, ClosureKind, IsoDate } from '../../../api/types';
import { COLOMBO_TZ } from '../../../lib/time';

export const KIND_LABELS: Record<ClosureKind, string> = {
  holiday: 'Holiday',
  closed: 'NIBM closed',
  class_day: 'Class day',
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Today's calendar date in Asia/Colombo. */
export function colomboToday(): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COLOMBO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDaysIso(d: IsoDate, n: number): IsoDate {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** "09:00:00" -> "09:00". */
export const trimTime = (t: string): string => t.slice(0, 5);
export const hourOf = (t: string): number => Number(t.slice(0, 2));
export const hourLabel = (h: number): string => `${String(h).padStart(2, '0')}:00`;

export interface ParsedClosures {
  rows: ClosureInput[];
  invalid: { line: number; text: string }[];
}

/** One per line: `YYYY-MM-DD` or `YYYY-MM-DD, reason`. Repeated dates: the last wins. */
export function parseClosureLines(text: string, kind: ClosureKind): ParsedClosures {
  const byDate = new Map<string, ClosureInput>();
  const invalid: ParsedClosures['invalid'] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const comma = line.indexOf(',');
    const date = (comma < 0 ? line : line.slice(0, comma)).trim();
    const reason = comma < 0 ? '' : line.slice(comma + 1).trim();
    if (!isValidDate(date)) {
      invalid.push({ line: i + 1, text: line });
      return;
    }
    byDate.set(date, { date, kind, reason: reason || null });
  });
  return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), invalid };
}
