import type { ApiError, ClassSession, ClassSessionInput, MySession, MySessions, Result, S14Api } from '../types';
import { getMockCurrentEmail } from './auth';
import { ensureFixtureLinks, mockContentAvailable, mockContentLinkInfo, mockContentMeta } from './content';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS, seedEnrolments } from './fixtures/s1';
import { sessionRows, type MockSessionRow } from './sessionStore';
import { MOCK_GROUP_COUNT, mockGroupOf } from './survey';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

const COHORTS = [MOCK_COHORT, MOCK_ARCHIVED_COHORT];
const currentUser = () => MOCK_USERS.find((u) => u.profile.email === getMockCurrentEmail()) ?? null;
const cohortOf = (id: string) => COHORTS.find((c) => c.id === id) ?? null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const instant = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).toISOString();

function toSession(r: MockSessionRow): ClassSession {
  return {
    id: r.id, cohort_id: r.cohort_id, date: r.date, start_time: r.start_time, end_time: r.end_time,
    starts_at: instant(r.date, r.start_time), ends_at: instant(r.date, r.end_time),
    title: r.title, group_nos: [...r.group_nos].sort((a, b) => a - b), deliverables: [...r.deliverables],
    lab_block_until: r.lab_block_until,
    content: r.content_ids.flatMap((id) => {
      const c = mockContentLinkInfo(id);
      return c ? [c] : [];
    }),
  };
}

let idSeq = 0;
function newId(): string {
  const ids = new Set(sessionRows().map((r) => r.id));
  let id: string;
  do id = `00000000-0000-4000-8000-0000000149${String(++idSeq).padStart(2, '0')}`;
  while (ids.has(id));
  return id;
}

const byStart = (a: MockSessionRow, b: MockSessionRow) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time);

function requireAdmin(): string | null {
  const u = currentUser();
  if (!u) return 'not_authenticated';
  return u.profile.is_admin ? null : 'forbidden';
}

function validDate(d: string): boolean {
  return DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
}

function validate(i: ClassSessionInput): { deliverables: string[]; groups: number[]; title: string; contentIds: string[] } | null {
  const title = i.title.trim();
  if (!title || title.length > 200) return null;
  if (!validDate(i.date) || !TIME_RE.test(i.start_time) || !TIME_RE.test(i.end_time) || i.start_time >= i.end_time) return null;
  if (i.lab_block_until !== null && !TIME_RE.test(i.lab_block_until) && i.lab_block_until !== '24:00') return null;
  const groups = [...new Set(i.group_nos)];
  if (groups.length === 0 || groups.some((g) => !Number.isInteger(g) || g < 1 || g > MOCK_GROUP_COUNT)) return null;
  const deliverables = i.deliverables.map((d) => d.trim()).filter(Boolean);
  if (deliverables.length > 20 || deliverables.some((d) => d.length > 300)) return null;
  const contentIds = [...new Set(i.content_ids)];
  for (const id of contentIds) {
    const m = mockContentMeta(id);
    if (!m || m.kind === 'resource' || m.cohort_id !== i.cohort_id) return null;
  }
  return { deliverables, groups, title, contentIds };
}

function toMySession(r: MockSessionRow): MySession {
  const s = toSession(r);
  return {
    id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time, starts_at: s.starts_at, ends_at: s.ends_at,
    title: s.title, group_nos: s.group_nos, deliverables: s.deliverables,
    content: s.content.map((c) => ({ id: c.id, kind: c.kind, title: c.title, available: mockContentAvailable(c.id) })),
  };
}

export const mockSessions: S14Api = {
  async adminListClassSessions(cohortId) {
    const err = requireAdmin();
    if (err) return fail(err);
    ensureFixtureLinks();
    if (!cohortOf(cohortId)) return fail('not_found');
    return ok(sessionRows().filter((r) => r.cohort_id === cohortId).sort(byStart).map(toSession));
  },

  async adminUpsertClassSession(input) {
    const err = requireAdmin();
    if (err) return fail(err);
    ensureFixtureLinks();
    const cohort = cohortOf(input.cohort_id);
    if (!cohort) return fail('not_found');
    const rows = sessionRows();
    const existing = input.id === null ? null : rows.find((r) => r.id === input.id);
    if (input.id !== null && !existing) return fail('not_found');
    if (existing && existing.cohort_id !== input.cohort_id) return fail('invalid_input');
    const v = validate(input);
    if (!v) return fail('invalid_input');
    if (cohort.status === 'archived') return fail('cohort_archived');
    const fields = {
      date: input.date, start_time: input.start_time, end_time: input.end_time, title: v.title,
      group_nos: v.groups.sort((a, b) => a - b), deliverables: v.deliverables,
      lab_block_until: input.lab_block_until, content_ids: v.contentIds,
    };
    if (existing) {
      Object.assign(existing, fields);
      return ok(toSession(existing));
    }
    const row: MockSessionRow = {
      id: newId(), cohort_id: input.cohort_id, ...fields,
      created_at: new Date().toISOString(),
    };
    rows.push(row);
    return ok(toSession(row));
  },

  async adminDeleteClassSession(id) {
    const err = requireAdmin();
    if (err) return fail(err);
    const rows = sessionRows();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return fail('not_found');
    if (cohortOf(rows[idx]!.cohort_id)?.status === 'archived') return fail('cohort_archived');
    rows.splice(idx, 1);
    return ok({ ok: true as const });
  },

  async getMySessions(cohortId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    ensureFixtureLinks();
    const e = seedEnrolments().find((x) => x.user_id === u.profile.id && x.cohort_id === cohortId && x.status === 'active');
    if (!e) return fail('forbidden');
    const group = e.role === 'student' ? mockGroupOf(e.id).group_no : null;
    const mine = sessionRows()
      .filter((r) => r.cohort_id === cohortId && (e.role !== 'student' || (group !== null && r.group_nos.includes(group))))
      .sort(byStart);
    const now = Date.now();
    const ended = (r: MockSessionRow) => Date.parse(instant(r.date, r.end_time)) <= now;
    const upcoming = mine.filter((r) => !ended(r)).slice(0, 10).map(toMySession);
    const recent = mine.filter(ended).reverse().slice(0, 5).map(toMySession);
    return ok<MySessions>({ next: upcoming[0] ?? null, upcoming, recent });
  },
};
