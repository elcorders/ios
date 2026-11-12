/**
 * Coordinator-owned shared mock state for §S14 class sessions.
 * `mock/sessions.ts` (S14.F) does CRUD on it; `mock/lab.ts` (S13.F) reads `labBlockUntil` (§S13).
 */
import { MOCK_COHORT } from './fixtures/s1';

export interface MockSessionRow {
  id: string;
  cohort_id: string;
  date: string; // YYYY-MM-DD (Colombo)
  start_time: string; // HH:MM
  end_time: string;
  title: string;
  group_nos: number[];
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
  const stamp = '2026-11-01T09:00:00+05:30';
  return [
    { id: sid(1), cohort_id: MOCK_COHORT.id, date: addDays(t, -2), start_time: '09:00', end_time: '12:00', title: 'Tutorial 1 — Demo game (fictional)',
      group_nos: [1, 2, 3], deliverables: ['Xcode installed', 'Demo game runs in the simulator'], lab_block_until: '16:00', content_ids: [], created_at: stamp },
    { id: sid(2), cohort_id: MOCK_COHORT.id, date: addDays(t, 1), start_time: '09:00', end_time: '12:00', title: 'Tutorial 2 — Layouts (fictional)',
      group_nos: [1, 2, 3], deliverables: ['Tutorial 1 pushed to GitHub', 'Bring a sketch of your app idea'], lab_block_until: '16:00', content_ids: [], created_at: stamp },
    { id: sid(3), cohort_id: MOCK_COHORT.id, date: addDays(t, 2), start_time: '13:00', end_time: '16:00', title: 'Tutorial 2 — Layouts (fictional)',
      group_nos: [4, 5, 6], deliverables: ['Tutorial 1 pushed to GitHub', 'Bring a sketch of your app idea'], lab_block_until: '24:00', content_ids: [], created_at: stamp },
    { id: sid(4), cohort_id: MOCK_COHORT.id, date: addDays(t, 9), start_time: '09:00', end_time: '11:00', title: 'Progress review (fictional)',
      group_nos: [1, 2, 3, 4, 5, 6], deliverables: [], lab_block_until: null, content_ids: [], created_at: stamp },
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
