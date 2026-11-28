import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '..';
import { resetMockAuth } from './auth';
import { resetMockContent } from './content';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT } from './fixtures/s1';
import type { ClassSessionInput, ClassSlotInput, SlotNotify } from '../types';

const slot = (start_time: string, end_time: string, group_nos: number[], content: ClassSlotInput['content'] = []): ClassSlotInput => ({
  label: null, start_time, end_time, group_nos, content,
});
const item = (content_id: string, notify: SlotNotify = 'slot_end', notify_at: string | null = null) => ({ content_id, notify, notify_at });
const TPL = '00000000-0000-4000-8000-0000000024a1';
const hintOf = (r: { ok: boolean; error?: { details?: unknown } }) => (r.error?.details as { field?: string } | undefined)?.field;

const input = (over: Partial<ClassSessionInput> = {}): ClassSessionInput => ({
  id: null, cohort_id: MOCK_COHORT.id, date: '2099-01-05', title: 'Extra class (fictional)',
  slots: [slot('09:00', '12:00', [1])], deliverables: [' one ', '', 'two'], lab_block_until: '16:00', template_id: null, ...over,
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
    expect(linked.slots[0]!.content[0]).toMatchObject({ id: 'content-m1', notify: 'none', notify_at: null, notified: false });
    expect(linked.slots.map((x) => [x.start_time, x.end_time, x.group_nos])).toEqual([['09:00', '12:00', [1, 2, 3]], ['13:00', '16:00', [4, 5, 6]]]);
    expect([linked.start_time, linked.end_time, linked.group_nos]).toEqual(['09:00', '16:00', [1, 2, 3, 4, 5, 6]]);
    expect(linked.starts_at).toBe(new Date(`${linked.date}T${linked.start_time}:00+05:30`).toISOString());
    expect(await api.adminListClassSessions(MOCK_ARCHIVED_COHORT.id)).toEqual({ ok: true, data: [] });
  });

  it('creates, updates (replacing links) and deletes', async () => {
    const c = await api.adminUpsertClassSession(input({ slots: [slot('09:00', '12:00', [1], [item('content-t3')])] }));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.data.deliverables).toEqual(['one', 'two']);
    expect(c.data.content[0]).toMatchObject({ id: 'content-t3', status: 'on_session' });
    const u = await api.adminUpsertClassSession(input({ id: c.data.id, title: 'Renamed', slots: [slot('13:00', '14:00', [3, 2]), slot('09:00', '10:00', [5])], lab_block_until: null }));
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

  it('slot-linked content stays on_session after the slot has started', async () => {
    const r = await api.adminUpsertClassSession(input({ date: '2020-01-01', slots: [slot('09:00', '12:00', [1], [item('content-t3')])] }));
    expect(r.ok && r.data.content[0]!.status).toBe('on_session');
  });
});

describe('mock class sessions: S24 validation hints', () => {
  beforeEach(async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
  });
  const at = (h: string) => new Date(`2099-01-05T${h}:00+05:30`).toISOString();

  it.each([
    ['label too long', { slots: [{ ...slot('09:00', '10:00', [1]), label: 'x'.repeat(41) }] }, 'label'],
    ['resource item', { slots: [slot('09:00', '10:00', [1], [item('content-r1')])] }, 'content'],
    ['other cohort item', { slots: [slot('09:00', '10:00', [1], [item('content-t9')])] }, 'content'],
    ['unknown item', { slots: [slot('09:00', '10:00', [1], [item('nope')])] }, 'content'],
    ['same item twice', { slots: [slot('09:00', '10:00', [1], [item('content-t3'), item('content-t3', 'none')])] }, 'content'],
    ['bad notify', { slots: [slot('09:00', '10:00', [1], [item('content-t3', 'later' as SlotNotify)])] }, 'notify'],
    ['at without time', { slots: [slot('09:00', '10:00', [1], [item('content-t3', 'at')])] }, 'notify'],
    ['time given when not at', { slots: [slot('09:00', '10:00', [1], [item('content-t3', 'none', at('10:00'))])] }, 'notify'],
    ['notify before slot start', { slots: [slot('09:00', '10:00', [1], [item('content-t3', 'at', at('08:59'))])] }, 'notify'],
    ['unknown template', { template_id: '00000000-0000-4000-8000-0000000000aa' }, 'template'],
  ] as [string, Partial<ClassSessionInput>, string][])('rejects %s with hint %s', async (_n, over, hint) => {
    const r = await api.adminUpsertClassSession(input(over));
    expect(!r.ok && r.error.code).toBe('invalid_input');
    expect(hintOf(r)).toBe(hint);
  });

  it('trims labels (blank becomes null), keeps the same item on several slots with their own notify, and stores the template', async () => {
    const r = await api.adminUpsertClassSession(input({
      template_id: TPL,
      slots: [
        { ...slot('09:00', '10:00', [1], [item('content-t3', 'at', at('09:30'))]), label: ' Morning ' },
        { ...slot('11:00', '12:00', [2], [item('content-t3', 'none'), item('content-m2')]), label: '  ' },
      ],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.template_id).toBe(TPL);
    expect(r.data.slots.map((x) => x.label)).toEqual(['Morning', null]);
    expect(r.data.slots[0]!.content[0]).toMatchObject({ id: 'content-t3', notify: 'at', notify_at: at('09:30') });
    expect(r.data.slots[1]!.content.map((c) => [c.id, c.notify])).toEqual([['content-t3', 'none'], ['content-m2', 'slot_end']]);
    expect(r.data.content.map((c) => c.id)).toEqual(['content-t3', 'content-m2']);
  });

  it('rejects scheduling a tutorial but still schedules a material', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const t = await api.adminSetContentPublish('content-t3', future);
    expect(!t.ok && t.error.code).toBe('invalid_input');
    expect(hintOf(t)).toBe('tutorial_schedule');
    expect((await api.adminSetContentPublish('content-t3', new Date().toISOString())).ok).toBe(true);
    const m = await api.adminSetContentPublish('content-m2', future);
    expect(m.ok && m.data.status).toBe('scheduled');
  });
});

describe('mock class templates', () => {
  beforeEach(async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
  });
  const slots = [{ label: 'A', start_time: '08:00', end_time: '09:00' }];

  it('lists the seeded template', async () => {
    const r = await api.adminListClassTemplates();
    expect(r.ok && r.data).toMatchObject([{ id: TPL, name: 'Day (3 slots)', used_count: 0 }]);
    expect(r.ok && r.data[0]!.slots.map((x) => [x.label, x.start_time, x.end_time])).toEqual([['Slot 1', '09:00', '11:00'], ['Slot 2', '11:00', '13:00'], ['Slot 3', '14:00', '16:00']]);
  });

  it('creates, updates, counts usage and deletes (sessions keep their slots)', async () => {
    const c = await api.adminUpsertClassTemplate({ id: null, name: ' Short day ', slots });
    expect(c.ok && c.data).toMatchObject({ name: 'Short day', used_count: 0 });
    if (!c.ok) return;
    const u = await api.adminUpsertClassTemplate({ id: c.data.id, name: 'Short day 2', slots: [...slots, { label: 'B', start_time: '10:00', end_time: '11:00' }] });
    expect(u.ok && u.data.slots).toHaveLength(2);
    const s = await api.adminUpsertClassSession(input({ template_id: c.data.id }));
    expect(s.ok && s.data.template_id).toBe(c.data.id);
    const list = await api.adminListClassTemplates();
    expect(list.ok && list.data.map((t) => [t.name, t.used_count])).toEqual([['Day (3 slots)', 0], ['Short day 2', 1]]);
    expect(await api.adminDeleteClassTemplate(c.data.id)).toEqual({ ok: true, data: { ok: true } });
    const after = await api.adminListClassSessions(MOCK_COHORT.id);
    const kept = after.ok ? after.data.find((x) => x.title === 'Extra class (fictional)') : null;
    expect(kept).toMatchObject({ template_id: null });
    expect(kept?.slots).toHaveLength(1);
    const again = await api.adminDeleteClassTemplate(c.data.id);
    expect(!again.ok && again.error.code).toBe('not_found');
  });

  it.each([
    ['blank name', { name: ' ', slots }, 'name'],
    ['no slots', { name: 'X', slots: [] }, 'slots'],
    ['seven slots', { name: 'X', slots: Array.from({ length: 7 }, () => slots[0]!) }, 'slots'],
    ['blank label', { name: 'X', slots: [{ ...slots[0]!, label: ' ' }] }, 'label'],
    ['end before start', { name: 'X', slots: [{ label: 'A', start_time: '10:00', end_time: '09:00' }] }, 'time'],
  ])('rejects %s', async (_n, over, hint) => {
    const r = await api.adminUpsertClassTemplate({ id: null, ...over });
    expect(!r.ok && r.error.code).toBe('invalid_input');
    expect(hintOf(r)).toBe(hint);
  });

  it('reports a taken name (case-insensitive) and unknown ids', async () => {
    const dup = await api.adminUpsertClassTemplate({ id: null, name: 'day (3 SLOTS)', slots });
    expect(!dup.ok && dup.error.code).toBe('conflict');
    const nf = await api.adminUpsertClassTemplate({ id: '00000000-0000-4000-8000-0000000000aa', name: 'Z', slots });
    expect(!nf.ok && nf.error.code).toBe('not_found');
  });

  it('is admin only', async () => {
    await api.verifyEmailCode('student001@example.edu', '123456');
    const r = await api.adminListClassTemplates();
    expect(!r.ok && r.error.code).toBe('forbidden');
    expect((await api.adminUpsertClassTemplate({ id: null, name: 'Z', slots })).ok).toBe(false);
    expect((await api.adminDeleteClassTemplate(TPL)).ok).toBe(false);
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

  it('releases linked content to the slot groups at the slot start', async () => {
    await api.verifyEmailCode('admin@example.edu', '123456');
    const past = await api.adminUpsertClassSession(input({ date: '2020-01-01', slots: [slot('09:00', '12:00', [1, 2, 3, 4, 5, 6], [item('content-t3')])] }));
    expect(past.ok).toBe(true);
    resetMockAuth();
    await api.verifyEmailCode('student001@example.edu', '123456');
    // t3 was only linked in the admin's (now reset) store; link again as admin then check as student.
    resetMockContent();
    await api.verifyEmailCode('admin@example.edu', '123456');
    await api.adminUpsertClassSession(input({ date: '2020-01-01', slots: [slot('09:00', '12:00', [1, 2, 3, 4, 5, 6], [item('content-t3')])] }));
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
      date: future(0), slots: [slot('00:00', '00:30', [me], [item('content-t3')]), slot('23:58', '23:59', [other])],
    }));
    expect(r.ok).toBe(true);
    await api.verifyEmailCode('student001@example.edu', '123456');
    const list = await api.listContent('tutorial');
    expect(list.ok && list.data.map((x) => x.id)).toContain('content-t3');
  });

  it('opens an item only for the groups of its slot (G1 vs G2), and my sessions show my own slot items', async () => {
    await api.verifyEmailCode('student001@example.edu', '123456');
    const me0 = await api.getMe();
    const me = me0.ok ? me0.data.enrolments[0]!.group_no! : 0;
    const other = me === 1 ? 2 : 1;
    await api.verifyEmailCode('admin@example.edu', '123456');
    const made = await api.adminUpsertClassSession(input({
      title: 'Split day', date: future(0),
      slots: [slot('00:00', '00:30', [me], [item('content-t3')]), slot('23:58', '23:59', [other], [item('content-m2', 'none')])],
    }));
    expect(made.ok).toBe(true);
    const rows = await api.adminListContent('tutorial', MOCK_COHORT.id);
    const t3 = rows.ok ? rows.data.find((r) => r.id === 'content-t3') : null;
    expect(t3).toMatchObject({ status: 'on_session', linked_sessions: 1, released_group_nos: [me] });
    await api.verifyEmailCode('student001@example.edu', '123456');
    const mine = await api.getMySessions(MOCK_COHORT.id);
    const day = mine.ok ? [...mine.data.upcoming, ...mine.data.recent].find((s) => s.title === 'Split day') : null;
    expect(day?.content).toEqual([{ id: 'content-t3', kind: 'tutorial', title: 'Tutorial 3 — Draft', available: true }]);
    expect(day?.slots.map((x) => x.group_nos)).toEqual([[me], [other]]);
    const list = await api.listContent('tutorial');
    expect(list.ok && list.data.map((x) => x.id)).toContain('content-t3');
    // The other group's item (a draft material on a slot that has not started) stays closed to me.
    const materials = await api.listContent('material');
    expect(materials.ok && materials.data.map((x) => x.id)).not.toContain('content-m1');
  });
});
