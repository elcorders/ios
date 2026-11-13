/**
 * Coordinator-owned shared mock state for §S14 class sessions.
 * `mock/sessions.ts` (S14.F) does CRUD on it; `mock/lab.ts` (S13.F) reads `labBlockUntil` (§S13).
 */
import { MOCK_COHORT } from './fixtures/s1';
import { MOCK_GROUP_COUNT } from './survey';

export interface MockSlot {
  start_time: string;
  end_time: string;
  group_nos: number[];
}

export interface MockSessionRow {
  id: string;
  cohort_id: string;
  date: string; // YYYY-MM-DD (Colombo)
  title: string;
  /** S18: 1–6 slots, ordered by start; a group is in at most one. Times are "HH:MM" (Colombo). */
  slots: MockSlot[];
  deliverables: string[];
  /** "HH:MM", "24:00" (whole day) or null (doesn't block). */
  lab_block_until: string | null;
  content_ids: string[];
  created_at: string;
}

const DAY_MS = 86_400_000;
const OFFSET_MS = 5.5 * 3_600_000;
const colomboToday = () => new Date(Date.now() + OFFSET_MS).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const sid = (n: number) => `00000000-0000-4000-8000-0000000014${String(n).padStart(2, '0')}`;

function seed(): MockSessionRow[] {
  const t = colomboToday();
  const all = Array.from({ length: MOCK_GROUP_COUNT }, (_, i) => i + 1);
  const half = Math.ceil(all.length / 2);
  const lower = all.slice(0, half);
  const upper = all.slice(half);
  const stamp = '2026-11-01T09:00:00+05:30';
  return [
    { id: sid(1), cohort_id: MOCK_COHORT.id, date: addDays(t, -2), title: 'Tutorial 1 — Demo game (fictional)',
      slots: [{ start_time: '09:00', end_time: '12:00', group_nos: [1, 2, 3] }], deliverables: ['Xcode installed', 'Demo game runs in the simulator'], lab_block_until: '16:00', content_ids: [], created_at: stamp },
    { id: sid(2), cohort_id: MOCK_COHORT.id, date: addDays(t, 1), title: 'Tutorial 2 — Layouts (fictional)',
      slots: [
        { start_time: '09:00', end_time: '12:00', group_nos: lower },
        { start_time: '13:00', end_time: '16:00', group_nos: upper },
      ],
      deliverables: ['Tutorial 1 pushed to GitHub', 'Bring a sketch of your app idea'], lab_block_until: '24:00', content_ids: [], created_at: stamp },
    { id: sid(4), cohort_id: MOCK_COHORT.id, date: addDays(t, 9), title: 'Progress review (fictional)',
      slots: [{ start_time: '09:00', end_time: '11:00', group_nos: all }], deliverables: [], lab_block_until: null, content_ids: [], created_at: stamp },
  ];
}

let rows: MockSessionRow[] = seed();

export function sessionRows(): MockSessionRow[] {
  return rows;
}
export function setSessionRows(next: MockSessionRow[]): void {
  rows = next;
}
export function resetMockSessions(): void {
  rows = seed();
}

/** §S13: latest `lab_block_until` of all sessions on that date (any cohort), "24:00" = whole day; null when none. */
export function labBlockUntil(date: string): string | null {
  let best: string | null = null;
  for (const r of rows) {
    if (r.date !== date || r.lab_block_until === null) continue;
    if (best === null || r.lab_block_until > best) best = r.lab_block_until;
  }
  return best;
}

/** Span of a row: earliest slot start, latest slot end. */
export function rowSpan(r: MockSessionRow): { start_time: string; end_time: string } {
  return {
    start_time: r.slots.reduce((m, x) => (x.start_time < m ? x.start_time : m), r.slots[0]!.start_time),
    end_time: r.slots.reduce((m, x) => (x.end_time > m ? x.end_time : m), r.slots[0]!.end_time),
  };
}
