/**
 * Coordinator-owned shared mock state for §S14 class sessions.
 * `mock/sessions.ts` (S14.F) does CRUD on it; `mock/lab.ts` (S13.F) reads `labBlockUntil` (§S13).
 */
import { MOCK_COHORT } from './fixtures/s1';
import { MOCK_GROUP_COUNT } from './survey';

/** §S24: a tutorial/material linked to a slot. */
export interface MockSlotContent {
  content_id: string;
  notify: 'slot_end' | 'at' | 'none';
  notify_at: string | null;
  notified: boolean;
}

export interface MockSlot {
  label: string | null;
  start_time: string;
  end_time: string;
  group_nos: number[];
  content: MockSlotContent[];
}

export interface MockTemplate {
  id: string;
  name: string;
  slots: { label: string; start_time: string; end_time: string }[];
  updated_at: string;
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
  template_id: string | null;
  created_at: string;
}

const DAY_MS = 86_400_000;
const OFFSET_MS = 5.5 * 3_600_000;
const colomboToday = () => new Date(Date.now() + OFFSET_MS).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const sid = (n: number) => `00000000-0000-4000-8000-0000000014${String(n).padStart(2, '0')}`;

const mk = (start_time: string, end_time: string, group_nos: number[]): MockSlot => ({ label: null, start_time, end_time, group_nos, content: [] });

function seed(): MockSessionRow[] {
  const t = colomboToday();
  const all = Array.from({ length: MOCK_GROUP_COUNT }, (_, i) => i + 1);
  const half = Math.ceil(all.length / 2);
  const lower = all.slice(0, half);
  const upper = all.slice(half);
  const stamp = '2026-11-01T09:00:00+05:30';
  return [
    { id: sid(1), cohort_id: MOCK_COHORT.id, date: addDays(t, -2), title: 'Tutorial 1 — Demo game (fictional)',
      slots: [mk('09:00', '12:00', [1, 2, 3])], deliverables: ['Xcode installed', 'Demo game runs in the simulator'], lab_block_until: '16:00', template_id: null, created_at: stamp },
    { id: sid(2), cohort_id: MOCK_COHORT.id, date: addDays(t, 1), title: 'Tutorial 2 — Layouts (fictional)',
      slots: [
        mk('09:00', '12:00', lower),
        mk('13:00', '16:00', upper),
      ],
      deliverables: ['Tutorial 1 pushed to GitHub', 'Bring a sketch of your app idea'], lab_block_until: '24:00', template_id: null, created_at: stamp },
    { id: sid(4), cohort_id: MOCK_COHORT.id, date: addDays(t, 9), title: 'Progress review (fictional)',
      slots: [mk('09:00', '11:00', all)], deliverables: [], lab_block_until: null, template_id: null, created_at: stamp },
  ];
}

const seedTemplates = (): MockTemplate[] => [{
  id: '00000000-0000-4000-8000-0000000024a1', name: 'Day (3 slots)', updated_at: '2026-11-01T09:00:00+05:30',
  slots: [
    { label: 'Slot 1', start_time: '09:00', end_time: '11:00' },
    { label: 'Slot 2', start_time: '11:00', end_time: '13:00' },
    { label: 'Slot 3', start_time: '14:00', end_time: '16:00' },
  ],
}];

let rows: MockSessionRow[] = seed();
let templates: MockTemplate[] = seedTemplates();

export function templateRows(): MockTemplate[] {
  return templates;
}
export function setTemplateRows(next: MockTemplate[]): void {
  templates = next;
}

export function sessionRows(): MockSessionRow[] {
  return rows;
}
export function setSessionRows(next: MockSessionRow[]): void {
  rows = next;
}
export function resetMockSessions(): void {
  rows = seed();
  templates = seedTemplates();
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
