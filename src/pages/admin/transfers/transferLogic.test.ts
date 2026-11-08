import { describe, expect, it } from 'vitest';
import type { AdminTransferRow, GroupStat } from '../../../api/types';
import { afterSizes, findSwapPairs, macSpread, spread, suggest } from './transferLogic';

const g = (no: number, has: number, no_mac: number, size = has + no_mac): GroupStat => ({ no, name: `Group ${no}`, size, has_mac: has, no_mac });

let n = 0;
const row = (over: Partial<AdminTransferRow>): AdminTransferRow => ({
  id: `r${++n}`, cohort_id: 'c1', from_no: 1, pref1_no: 2, pref2_no: 3, reason: 'Fictional reason', status: 'open', decided_no: null,
  admin_note: null, closed_by: null, created_at: `2026-11-08T09:${String(n).padStart(2, '0')}:00+05:30`, decided_at: null,
  enrolment_id: `e${n}`, enrolment_status: 'active', email: `student${n}@example.edu`, index_no: null, first_name: 'S', last_name: 'T',
  has_mac: true, current_no: over.from_no ?? 1, decided_by_email: null, ...over,
});

describe('afterSizes', () => {
  const groups = [g(1, 3, 2), g(2, 1, 1), g(3, 0, 0)];
  it('moves one student between buckets without mutating input', () => {
    const out = afterSizes(groups, 1, 2, true);
    expect(out[0]).toMatchObject({ size: 4, has_mac: 2, no_mac: 2 });
    expect(out[1]).toMatchObject({ size: 3, has_mac: 2, no_mac: 1 });
    expect(out[2]).toMatchObject({ size: 0 });
    expect(groups[0]!.size).toBe(5);
  });
  it('uses the no_mac bucket for false', () => {
    const out = afterSizes(groups, 1, 2, false);
    expect(out[0]).toMatchObject({ has_mac: 3, no_mac: 1 });
    expect(out[1]).toMatchObject({ has_mac: 1, no_mac: 2 });
  });
  it('unsurveyed (null) changes only size', () => {
    const out = afterSizes(groups, 1, 2, null);
    expect(out[0]).toMatchObject({ size: 4, has_mac: 3, no_mac: 2 });
    expect(out[1]).toMatchObject({ size: 3, has_mac: 1, no_mac: 1 });
  });
  it('a student with no group only adds to the target', () => {
    const out = afterSizes(groups, null, 3, true);
    expect(out.map((x) => x.size)).toEqual([5, 2, 1]);
  });
});

describe('spread / macSpread', () => {
  it('is max minus min', () => {
    expect(spread([g(1, 3, 2), g(2, 1, 1), g(3, 0, 0)])).toBe(5);
    expect(spread([])).toBe(0);
  });
  it('uses the chosen bucket, and 0 for unsurveyed', () => {
    const groups = [g(1, 4, 0), g(2, 1, 3)];
    expect(macSpread(groups, true)).toBe(3);
    expect(macSpread(groups, false)).toBe(3);
    expect(macSpread([g(1, 4, 1), g(2, 1, 1)], false)).toBe(0);
    expect(macSpread(groups, null)).toBe(0);
  });
});

describe('suggest', () => {
  it('prefers the option with the lower spread', () => {
    const groups = [g(1, 2, 2), g(2, 3, 3), g(3, 1, 1)];
    const s = suggest(groups, { from_no: 1, pref1_no: 2, pref2_no: 3, has_mac: true });
    expect(s.choice).toBe('pref2');
    expect(s.options[0]!.groupNo).toBe(2);
    expect(s.options[0]!.spread).toBe(5);
    expect(s.options[1]!.spread).toBe(3);
  });
  it('breaks equal spread by the student bucket spread', () => {
    // sizes 4,4,4 -> moving 1->2 or 1->3 both give spread 2; has_mac counts differ
    const groups = [g(1, 2, 2), g(2, 3, 1), g(3, 1, 3)];
    const s = suggest(groups, { from_no: 1, pref1_no: 2, pref2_no: 3, has_mac: true });
    expect(s.options[0]!.spread).toBe(s.options[1]!.spread);
    // has_mac after: pref1 -> [1,4,1] spread 3; pref2 -> [1,3,2] spread 2
    expect(s.choice).toBe('pref2');
  });
  it('ties go to pref 1 (also for unsurveyed students)', () => {
    const groups = [g(1, 2, 2), g(2, 2, 2), g(3, 2, 2)];
    expect(suggest(groups, { from_no: 1, pref1_no: 2, pref2_no: 3, has_mac: true }).choice).toBe('pref1');
    expect(suggest(groups, { from_no: 1, pref1_no: 2, pref2_no: 3, has_mac: null }).choice).toBe('pref1');
  });
  it('warns only when after-spread >= 2 and bigger than before', () => {
    const groups = [g(1, 2, 2), g(2, 2, 2), g(3, 1, 1)];
    const s = suggest(groups, { from_no: 1, pref1_no: 2, pref2_no: 3, has_mac: true });
    expect(s.options[0]!.warn).toBe(true); // 4,4,2 -> after 3,5,2 spread 3 > 2
    expect(s.options[1]!.warn).toBe(false); // 3,4,3 spread 1
    // before 2 (5,3,3 -> sizes), moving keeps spread 2: not bigger, so no warning
    const flat = [g(1, 3, 2), g(2, 2, 1), g(3, 2, 1)];
    const t = suggest(flat, { from_no: 1, pref1_no: 2, pref2_no: 3, has_mac: true });
    expect(t.options[0]!.spread).toBe(1);
    expect(t.options[0]!.warn).toBe(false);
    // even sizes 2,2,2 -> after spread 2 > 0: warns
    const even = [g(1, 1, 1), g(2, 1, 1), g(3, 1, 1)];
    const u = suggest(even, { from_no: 1, pref1_no: 2, pref2_no: 3, has_mac: true });
    expect(u.options[0]!.spread).toBe(2);
    expect(u.options[0]!.warn).toBe(true);
    // even sizes 1,1: after spread 2 -> warns; spread 1 after (from 0) never warns
    expect(suggest([g(1, 1, 0), g(2, 0, 0)], { from_no: 1, pref1_no: 2, pref2_no: 2, has_mac: true }).options[0]!.warn).toBe(false);
    expect(suggest([g(1, 1, 0), g(2, 0, 0), g(3, 1, 0)], { from_no: 1, pref1_no: 2, pref2_no: 2, has_mac: true }).options[0]!.warn).toBe(false);
  });
});

describe('findSwapPairs', () => {
  it('pairs requests that want each other\'s group', () => {
    const a = row({ from_no: 1, pref1_no: 2, pref2_no: 3 });
    const b = row({ from_no: 2, pref1_no: 1, pref2_no: 3 });
    const c = row({ from_no: 3, pref1_no: 1, pref2_no: 2 });
    const pairs = findSwapPairs([a, b, c]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.a.id).toBe(a.id);
    expect(pairs[0]!.b.id).toBe(b.id);
  });
  it('accepts a pref 2 match', () => {
    const a = row({ from_no: 1, pref1_no: 3, pref2_no: 2 });
    const b = row({ from_no: 2, pref1_no: 4, pref2_no: 1 });
    expect(findSwapPairs([a, b])).toHaveLength(1);
  });
  it('prefers a partner where both moves are pref 1 over an older one', () => {
    const a = row({ from_no: 1, pref1_no: 2, pref2_no: 3 });
    const older = row({ from_no: 3, pref1_no: 4, pref2_no: 1 }); // wants 1 as pref 2
    const best = row({ from_no: 2, pref1_no: 1, pref2_no: 4 });
    const pairs = findSwapPairs([a, older, best]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.b.id).toBe(best.id);
  });
  it('falls back to the oldest matching partner', () => {
    const a = row({ from_no: 1, pref1_no: 2, pref2_no: 3 });
    const b1 = row({ from_no: 3, pref1_no: 4, pref2_no: 1 });
    const b2 = row({ from_no: 2, pref1_no: 4, pref2_no: 1 });
    expect(findSwapPairs([b2, b1, a])[0]!.b.id).toBe(b1.id);
  });
  it('puts each request in at most one pair', () => {
    const a = row({ from_no: 1, pref1_no: 2, pref2_no: 3 });
    const b = row({ from_no: 2, pref1_no: 1, pref2_no: 3 });
    const c = row({ from_no: 2, pref1_no: 1, pref2_no: 3 });
    const d = row({ from_no: 1, pref1_no: 2, pref2_no: 3 });
    const pairs = findSwapPairs([a, b, c, d]);
    const ids = pairs.flatMap((p) => [p.a.id, p.b.id]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pairs).toHaveLength(2);
  });
  it('excludes non-open requests and non-active enrolments', () => {
    const a = row({ from_no: 1, pref1_no: 2, pref2_no: 3 });
    const removed = row({ from_no: 2, pref1_no: 1, pref2_no: 3, enrolment_status: 'removed' });
    const done = row({ from_no: 2, pref1_no: 1, pref2_no: 3, status: 'approved' });
    expect(findSwapPairs([a, removed, done])).toEqual([]);
  });
  it('needs mutual wants', () => {
    const a = row({ from_no: 1, pref1_no: 2, pref2_no: 3 });
    const b = row({ from_no: 2, pref1_no: 3, pref2_no: 4 });
    expect(findSwapPairs([a, b])).toEqual([]);
  });
});
