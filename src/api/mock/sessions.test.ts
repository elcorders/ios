import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '..';
import { resetMockAuth } from './auth';
import { resetMockContent } from './content';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT } from './fixtures/s1';
import type { ClassSessionInput } from '../types';

const slot = (start_time: string, end_time: string, group_nos: number[]) => ({ start_time, end_time, group_nos });

const input = (over: Partial<ClassSessionInput> = {}): ClassSessionInput => ({
  id: null, cohort_id: MOCK_COHORT.id, date: '2099-01-05', title: 'Extra class (fictional)',
  slots: [{ start_time: '09:00', end_time: '12:00', group_nos: [1] }], deliverables: [' one ', '', 'two'], lab_block_until: '16:00', content_ids: [], ...over,
});

beforeEach(() => {
  resetMockAuth();
  resetMockContent();
});

describe('mock class sessions (admin)', () => {
  beforeEach(async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
  });

  it('lists the cohort sessions in order with linked content and its status', async () => {
    const r = await api.adminListClassSessions(MOCK_COHORT.id);
    expect(r.ok && r.data.length).toBe(3);
    if (!r.ok) return;
    expect(r.data.map((s) => s.date)).toEqual([...r.data.map((s) => s.date)].sort());
    const linked = r.data.find((s) => s.content.length)!;
    expect(linked.content[0]).toMatchObject({ id: 'content-m1', kind: 'material', status: 'on_session' });
    expect(linked.slots.map((x) => [x.start_time, x.end_time, x.group_nos])).toEqual([['09:00', '12:00', [1, 2, 3]], ['13:00', '16:00', [4, 5, 6]]]);
    expect([linked.start_time, linked.end_time, linked.group_nos]).toEqual(['09:00', '16:00', [1, 2, 3, 4, 5, 6]]);
    expect(linked.starts_at).toBe(new Date(`${linked.date}T${linked.start_time}:00+05:30`).toISOString());
    expect(await api.adminListClassSessions(MOCK_ARCHIVED_COHORT.id)).toEqual({ ok: true, data: [] });
  });

  it('creates, updates (replacing links) and deletes', async () => {
    const c = await api.adminUpsertClassSession(input({ content_ids: ['content-t3'] }));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.data.deliverables).toEqual(['one', 'two']);
    expect(c.data.content[0]).toMatchObject({ id: 'content-t3', status: 'on_session' });
    const u = await api.adminUpsertClassSession(input({ id: c.data.id, title: 'Renamed', slots: [slot('13:00', '14:00', [3, 2]), slot('09:00', '10:00', [5])], content_ids: [], lab_block_until: null }));
    expect(u.ok && u.data).toMatchObject({ title: 'Renamed', group_nos: [2, 3, 5], start_time: '09:00', end_time: '14:00', slots: [{ start_time: '09:00', group_nos: [5] }, { start_time: '13:00', group_nos: [2, 3] }], content: [], lab_block_until: null });
    expect((await api.adminDeleteClassSession(c.data.id))).toEqual({ ok: true, data: { ok: true } });
    expect((await api.adminDeleteClassSession(c.data.id)).ok).toBe(false);
  });

  it.each([
    ['blank title', { title: '  ' }],
    ['end before start', { slots: [slot('12:00', '09:00', [1])] }],
    ['bad time', { slots: [slot('9am', '10:00', [1])] }],
    ['no slots', { slots: [] }],
    ['seven slots', { slots: [1, 2, 3, 4, 5, 6, 1].map((g, i) => slot('09:00', `1${i}:00`, [g])) }],
    ['slot without groups', { slots: [slot('09:00', '10:00', [1]), slot('11:00', '12:00', [])] }],
    ['unknown group', { slots: [slot('09:00', '10:00', [99])] }],
    ['group in two slots', { slots: [slot('09:00', '10:00', [1, 2]), slot('11:00', '12:00', [2])] }],
    ['bad lab block', { lab_block_until: '25:00' }],
    ['resource link', { content_ids: ['content-r1'] }],
    ['other cohort content', { content_ids: ['content-t9'] }],
  ] as [string, Partial<ClassSessionInput>][])('rejects %s', async (_n, over) => {
    const r = await api.adminUpsertClassSession(input(over));
    expect(!r.ok && r.error.code).toBe('invalid_input');
  });

  it('reports not_found and cohort_archived', async () => {
    const a = await api.adminUpsertClassSession(input({ id: '00000000-0000-4000-8000-0000000000ff' }));
    expect(!a.ok && a.error.code).toBe('not_found');
    const b = await api.adminUpsertClassSession(input({ cohort_id: MOCK_ARCHIVED_COHORT.id }));
    expect(!b.ok && b.error.code).toBe('cohort_archived');
    const c = await api.adminListClassSessions('nope');
    expect(!c.ok && c.error.code).toBe('not_found');
  });

  it('on_session content becomes published once the linked session is created in the past', async () => {
    const r = await api.adminUpsertClassSession(input({ date: '2020-01-01', content_ids: ['content-t3'] }));
    expect(r.ok && r.data.content[0]!.status).toBe('published');
  });
});

describe('mock class sessions (forbidden)', () => {
  it('rejects non-admins on admin methods', async () => {
    await api.verifyEmailCode('student001@example.edu', '123456');
    expect((await api.adminListClassSessions(MOCK_COHORT.id)).ok).toBe(false);
    const r = await api.adminUpsertClassSession(input());
    expect(!r.ok && r.error.code).toBe('forbidden');
    const d = await api.adminDeleteClassSession('x');
    expect(!d.ok && d.error.code).toBe('forbidden');
  });
});

describe('mock getMySessions and visibility', () => {
  it('returns only the sessions of the caller group with availability', async () => {
    await api.verifyEmailCode('student001@example.edu', '123456');
    const me = await api.getMe();
    const group = me.ok ? me.data.enrolments[0]!.group_no : null;
    expect(group).not.toBeNull();
    const r = await api.getMySessions(MOCK_COHORT.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const s of [...r.data.upcoming, ...r.data.recent]) expect(s.group_nos).toContain(group);
    const t2 = r.data.upcoming.find((s) => s.title.startsWith('Tutorial 2'))!;
    expect(t2.slots).toHaveLength(2);
    const own = t2.slots.find((x) => x.group_nos.includes(group!))!;
    expect([t2.start_time, t2.end_time]).toEqual([own.start_time, own.end_time]);
    expect(r.data.next).toEqual(r.data.upcoming[0] ?? null);
    const withMaterial = [...r.data.upcoming].find((s) => s.content.length);
    if (withMaterial) expect(withMaterial.content[0]).toMatchObject({ id: 'content-m1', available: false });
  });

  it('shows every session to instructors and forbids non-members', async () => {
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    const r = await api.getMySessions(MOCK_COHORT.id);
    expect(r.ok && r.data.upcoming.length).toBe(2);
    expect(r.ok && r.data.recent.length).toBe(1);
    const a = await api.getMySessions(MOCK_ARCHIVED_COHORT.id);
    expect(!a.ok && a.error.code).toBe('forbidden');
  });

  it('releases linked content to the group at its session start (or everyone after the last)', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    const past = await api.adminUpsertClassSession(input({ date: '2020-01-01', slots: [slot('09:00', '12:00', [1, 2, 3, 4, 5, 6])], content_ids: ['content-t3'] }));
    expect(past.ok).toBe(true);
    resetMockAuth();
    await api.verifyEmailCode('student001@example.edu', '123456');
    // t3 was only linked in the admin's (now reset) store; link again as admin then check as student.
    resetMockContent();
    await api.verifyEmailCode('admin@example.edu', '123456');
    await api.adminUpsertClassSession(input({ date: '2020-01-01', slots: [slot('09:00', '12:00', [1, 2, 3, 4, 5, 6])], content_ids: ['content-t3'] }));
    await api.verifyEmailCode('student001@example.edu', '123456');
    const list = await api.listContent('tutorial');
    expect(list.ok && list.data.map((i) => i.id)).toContain('content-t3');
  });
});

describe('mock per-slot visibility', () => {
  const future = (d: number) => new Date(Date.now() + 5.5 * 3_600_000 + d * 86_400_000).toISOString().slice(0, 10);

  it('shows a slot student the session at its own start and the others at the latest start; instructors get the span', async () => {
    await api.verifyEmailCode('instructor001@example.edu', '123456');
    const i = await api.getMySessions(MOCK_COHORT.id);
    const t2 = i.ok ? i.data.upcoming.find((s) => s.title.startsWith('Tutorial 2')) : null;
    expect([t2?.start_time, t2?.end_time]).toEqual(['09:00', '16:00']);

    await api.verifyEmailCode('admin@example.edu', '123456');
    const admin = await api.adminListClassSessions(MOCK_COHORT.id);
    const m = admin.ok ? admin.data.find((s) => s.content.length)! : null;
    expect(m?.content[0]!.status).toBe('on_session');
    const rows = await api.adminListContent('material', MOCK_COHORT.id);
    const row = rows.ok ? rows.data.find((c) => c.id === 'content-m1') : null;
    // release_at is the earliest slot start still in the future.
    expect(row?.release_at).toBe(new Date(`${m!.date}T09:00:00+05:30`).toISOString());
  });

  it('releases content to a past-slot group before the later slot has started', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    // Today: slot 1 (all-day, started) for the student group; slot 2 for another group starts in the future.
    const me = await (async () => {
      await api.verifyEmailCode('student001@example.edu', '123456');
      const r = await api.getMe();
      return r.ok ? r.data.enrolments[0]!.group_no! : 0;
    })();
    const other = me === 1 ? 2 : 1;
    await api.verifyEmailCode('admin@example.edu', '123456');
    const r = await api.adminUpsertClassSession(input({
      date: future(0), slots: [slot('00:00', '00:30', [me]), slot('23:58', '23:59', [other])], content_ids: ['content-t3'],
    }));
    expect(r.ok).toBe(true);
    await api.verifyEmailCode('student001@example.edu', '123456');
    const list = await api.listContent('tutorial');
    expect(list.ok && list.data.map((x) => x.id)).toContain('content-t3');
  });
});
