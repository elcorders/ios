import type { SurveyOverview, SurveyOverviewRow } from '../../../api/types';

export type GroupInfo = SurveyOverview['groups'][number];

export interface GroupStats {
  students: number;
  answered: number;
  groups: number;
  /** Largest minus smallest group size. */
  balance: number;
  max: number;
}

export function computeStats(data: SurveyOverview): GroupStats {
  const sizes = data.groups.map((g) => g.size);
  const max = sizes.length ? Math.max(...sizes) : 0;
  const min = sizes.length ? Math.min(...sizes) : 0;
  return {
    students: data.counts.students,
    answered: data.counts.answered,
    groups: data.groups.length,
    balance: max - min,
    max,
  };
}

/** Grid line values for the shared x scale: 0..max, at most 6 lines. */
export function axisTicks(max: number): number[] {
  if (max <= 0) return [0];
  const step = Math.max(1, Math.ceil(max / 5));
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0;
}

export function fullName(r: SurveyOverviewRow): string {
  return `${r.first_name} ${r.last_name}`.trim() || r.email;
}

export function matchesQuery(r: SurveyOverviewRow, q: string): boolean {
  if (!q) return true;
  return [r.first_name, r.last_name, r.index_no ?? '', r.email].join(' ').toLowerCase().includes(q);
}
