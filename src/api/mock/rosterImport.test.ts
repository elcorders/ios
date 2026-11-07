import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../index';
import { resetMockAuth } from './auth';
import { resetMockAdmin } from './admin';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT } from './fixtures/s1';
import type { EnrolmentRole, RosterRow } from '../types';

const base = { cohort_id: MOCK_COHORT.id, role: 'student' as EnrolmentRole };
const row = (n: number, over: Partial<RosterRow> = {}): RosterRow => ({
  email: `student0${n}@example.edu`, first_name: 'New', last_name: 'Person', ...over,
});

beforeEach(async () => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
  await api.verifyEmailCode('admin@example.edu', '123456');
});

async function run(rows: RosterRow[], dry_run = true, over: Partial<typeof base> = {}) {
  const res = await api.rosterImport({ ...base, ...over, dry_run, rows });
  if (!res.ok) throw new Error(res.error.code);
  return res.data;
}

describe('mock rosterImport', () => {
  it('is forbidden for non-admins', async () => {
    resetMockAuth();
    await api.verifyEmailCode('student001@example.edu', '123456');
    const res = await api.rosterImport({ ...base, dry_run: true, rows: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('forbidden');
  });

  it('dry run reports add/update/unchanged without writing', async () => {
    const r = await run([
      row(80),
      { email: 'STUDENT001@example.edu', first_name: 'Test001', last_name: 'Student' },
      { email: 'student002@example.edu', first_name: 'Renamed', last_name: 'Student', phone: '071 234 5678' },
    ]);
    expect(r.applied).toBe(false);
    expect(r.add.map((x) => x.email)).toEqual(['student080@example.edu']);
    expect(r.unchanged).toBe(1);
    expect(r.update).toHaveLength(1);
    expect(r.update[0]!.changes).toEqual({ first_name: ['Test002', 'Renamed'], phone: [null, '+94712345678'] });
    expect(r.not_in_file.length).toBeGreaterThan(5);
    const members = await api.listMembers(MOCK_COHORT.id, 'student');
    expect(members.ok && members.data.some((m) => m.email === 'student080@example.edu')).toBe(false);
  });

  it('applies and is idempotent', async () => {
    const rows = [row(80, { phone: '94711234567' }), row(81, { index_no: 'COBSCCOMP251P-081' })];
    const first = await run(rows, false);
    expect(first.applied).toBe(true);
    expect(first.add).toHaveLength(2);
    const second = await run(rows, false);
    expect(second.add).toHaveLength(0);
    expect(second.update).toHaveLength(0);
    expect(second.unchanged).toBe(2);
    const members = await api.listMembers(MOCK_COHORT.id, 'student');
    expect(members.ok && members.data.find((m) => m.email === 'student080@example.edu')?.phone).toBe('+94711234567');
  });

  it('reports row errors and still applies valid rows', async () => {
    const r = await run([
      row(80),
      row(81, { email: 'not-an-email' }),
      row(82, { first_name: ' ' }),
      row(80),
      row(83, { index_no: 'COBSCCOMP251P-001' }),
      row(84, { phone: '12345' }),
      row(85),
    ], false);
    expect(r.errors.map((e) => [e.row_index, e.code])).toEqual([
      [1, 'invalid_email'], [2, 'missing_name'], [3, 'duplicate_in_file'], [4, 'index_conflict'], [5, 'invalid_phone'],
    ]);
    expect(r.add.map((x) => x.email)).toEqual(['student080@example.edu', 'student085@example.edu']);
    expect(r.applied).toBe(true);
  });

  it('blank optional fields do not clear stored values', async () => {
    await run([{ email: 'student001@example.edu', first_name: 'Test001', last_name: 'Student' }], false);
    const members = await api.listMembers(MOCK_COHORT.id, 'student');
    expect(members.ok && members.data.find((m) => m.email === 'student001@example.edu')?.index_no).toBe('COBSCCOMP251P-001');
  });

  it('reactivates removed members and changes role through update', async () => {
    const removed = await api.listMembers(MOCK_COHORT.id);
    const gone = removed.ok ? removed.data.find((m) => m.status === 'removed')! : null;
    expect(gone).toBeTruthy();
    const r = await run([{ email: gone!.email, first_name: gone!.first_name, last_name: gone!.last_name }], false, { role: 'instructor' });
    expect(r.update[0]!.changes).toMatchObject({ status: ['removed', 'active'], role: ['student', 'instructor'] });
  });

  it('rejects archived cohorts', async () => {
    const res = await api.rosterImport({ ...base, cohort_id: MOCK_ARCHIVED_COHORT.id, dry_run: true, rows: [] });
    expect(!res.ok && res.error.code).toBe('cohort_archived');
  });

  it('rejects more than 500 rows', async () => {
    const res = await api.rosterImport({ ...base, dry_run: true, rows: Array.from({ length: 501 }, (_, i) => row(i)) });
    expect(!res.ok && res.error.code).toBe('invalid_input');
  });
});
