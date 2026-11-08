import type { AdminTransferRow, GroupStat } from '../../../api/types';

/** Pure approval-flow helpers (CONTRACT.md S8 "Approval flow"). No I/O. */

/** Group sizes after moving one student (has_mac h) from group `from` to group `to`. Inputs are not mutated. */
export function afterSizes(groups: GroupStat[], from: number | null, to: number, hasMac: boolean | null): GroupStat[] {
  return groups.map((g) => {
    const delta = g.no === to ? 1 : g.no === from ? -1 : 0;
    if (delta === 0) return { ...g };
    return {
      ...g,
      size: g.size + delta,
      has_mac: hasMac === true ? g.has_mac + delta : g.has_mac,
      no_mac: hasMac === false ? g.no_mac + delta : g.no_mac,
    };
  });
}

/** Largest minus smallest group size (0 when there are no groups). */
export function spread(groups: GroupStat[]): number {
  if (groups.length === 0) return 0;
  const sizes = groups.map((g) => g.size);
  return Math.max(...sizes) - Math.min(...sizes);
}

/** Spread of the student's own Mac bucket. An unsurveyed student (null) has no bucket: 0. */
export function macSpread(groups: GroupStat[], hasMac: boolean | null): number {
  if (hasMac === null || groups.length === 0) return 0;
  const counts = groups.map((g) => (hasMac ? g.has_mac : g.no_mac));
  return Math.max(...counts) - Math.min(...counts);
}

export interface SuggestOption {
  groupNo: number;
  /** Group stats after the move. */
  after: GroupStat[];
  spread: number;
  /** After-spread >= 2 and bigger than before. */
  warn: boolean;
}

export interface Suggestion {
  choice: 'pref1' | 'pref2';
  /** [pref 1, pref 2] */
  options: [SuggestOption, SuggestOption];
}

type SuggestRow = Pick<AdminTransferRow, 'from_no' | 'pref1_no' | 'pref2_no' | 'has_mac'>;

export function suggest(groups: GroupStat[], row: SuggestRow): Suggestion {
  const before = spread(groups);
  const make = (groupNo: number): SuggestOption => {
    const after = afterSizes(groups, row.from_no, groupNo, row.has_mac);
    const s = spread(after);
    return { groupNo, after, spread: s, warn: s >= 2 && s > before };
  };
  const o1 = make(row.pref1_no);
  const o2 = make(row.pref2_no);
  let choice: 'pref1' | 'pref2' = 'pref1';
  if (o2.spread < o1.spread) choice = 'pref2';
  else if (o2.spread === o1.spread && macSpread(o2.after, row.has_mac) < macSpread(o1.after, row.has_mac)) choice = 'pref2';
  return { choice, options: [o1, o2] };
}

export interface SwapPair {
  a: AdminTransferRow;
  b: AdminTransferRow;
}

const wants = (r: AdminTransferRow, groupNo: number) => r.pref1_no === groupNo || r.pref2_no === groupNo;
const canSwap = (a: AdminTransferRow, b: AdminTransferRow) =>
  a.id !== b.id && a.cohort_id === b.cohort_id && wants(a, b.from_no) && wants(b, a.from_no);
const bothPref1 = (a: AdminTransferRow, b: AdminTransferRow) => a.pref1_no === b.from_no && b.pref1_no === a.from_no;

/** Swap pairs among open requests with active enrolments. Oldest first; each request is in at most one pair. */
export function findSwapPairs(rows: AdminTransferRow[]): SwapPair[] {
  const open = rows
    .filter((r) => r.status === 'open' && r.enrolment_status === 'active')
    .sort((x, y) => x.created_at.localeCompare(y.created_at));
  const used = new Set<string>();
  const pairs: SwapPair[] = [];
  for (const a of open) {
    if (used.has(a.id)) continue;
    const candidates = open.filter((b) => !used.has(b.id) && canSwap(a, b));
    const b = candidates.find((c) => bothPref1(a, c)) ?? candidates[0];
    if (!b) continue;
    used.add(a.id);
    used.add(b.id);
    pairs.push({ a, b });
  }
  return pairs;
}
