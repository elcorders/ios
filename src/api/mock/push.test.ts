import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../index';
import { resetMockAuth } from './auth';
import { resetMockLab } from './lab';
import { resetMockPush } from './push';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT } from './fixtures/s1';

const C = MOCK_COHORT.id;
const asAdmin = () => api.verifyEmailCode('admin@example.edu', '123456');
const asStudent = (n: number) => api.verifyEmailCode(`student${String(n).padStart(3, '0')}@example.edu`, '123456');
const must = <T>(r: { ok: true; data: T } | { ok: false; error: { code: string } }): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
};

beforeEach(() => {
  resetMockAuth();
  resetMockPush();
  resetMockLab();
});

describe('mock inbox', () => {
  it('seeds student005 with unread reminders and a lab deep link', async () => {
    await asStudent(5);
    const { items, has_more } = must(await api.listMyNotifications());
    expect(has_more).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.filter((n) => !n.read_at).map((n) => n.kind)).toEqual(expect.arrayContaining(['class_reminder', 'booking_reminder']));
    expect(items.find((n) => n.kind === 'booking_reminder')?.url).toMatch(/^\/#\/lab\?b=/);
    expect(must(await api.getMyPush()).unread).toBe(2);
  });

  it('marks some, then all, as read; other users see their own inbox', async () => {
    await asStudent(5);
    const first = must(await api.listMyNotifications()).items.find((n) => !n.read_at)!;
    expect(must(await api.markNotificationsRead([first.id])).updated).toBe(1);
    expect(must(await api.getMyPush()).unread).toBe(1);
    expect(must(await api.markNotificationsRead(null)).updated).toBe(1);
    expect(must(await api.getMyPush()).unread).toBe(0);
    await asStudent(6);
    expect(must(await api.listMyNotifications()).items).toEqual([]);
  });

  it('pages with before', async () => {
    await asStudent(5);
    const all = must(await api.listMyNotifications()).items;
    const older = must(await api.listMyNotifications(all[1]!.created_at)).items;
    expect(older.map((n) => n.id)).toEqual(all.slice(2).map((n) => n.id));
  });

  it('needs sign-in', async () => {
    const r = await api.listMyNotifications();
    expect(r.ok).toBe(false);
  });
});

describe('mock admin push', () => {
  it('lists all kinds except test and switches them', async () => {
    await asAdmin();
    const kinds = must(await api.adminPushStats()).kinds;
    expect(kinds.some((k) => k.kind === 'test')).toBe(false);
    expect(kinds.every((k) => k.enabled)).toBe(true);
    expect(must(await api.adminSetPushKind('lab_closed', false))).toEqual({ kind: 'lab_closed', enabled: false });
    expect(must(await api.adminPushStats()).kinds.find((k) => k.kind === 'lab_closed')?.enabled).toBe(false);
    expect((await api.adminSetPushKind('nope' as never, true)).ok).toBe(false);
  });

  it('forbids students', async () => {
    await asStudent(5);
    const r = await api.adminPushStats();
    expect(r.ok ? 'ok' : r.error.code).toBe('forbidden');
    const c = await api.adminPushAudience(C, null);
    expect(c.ok ? 'ok' : c.error.code).toBe('forbidden');
  });

  it('counts the audience from groups and devices', async () => {
    await asStudent(5);
    await api.savePushSubscription({ endpoint: 'https://push.example.test/s5', p256dh: 'k', auth: 'a', user_agent: null });
    await asAdmin();
    const all = must(await api.adminPushAudience(C, null));
    expect(all.students).toBeGreaterThan(0);
    expect(all.with_push).toBe(1);
    const g1 = must(await api.adminPushAudience(C, [1]));
    expect(g1.students).toBeLessThanOrEqual(all.students);
    expect((await api.adminPushAudience('nope', null)).ok).toBe(false);
  });

  it('custom send adds inbox rows, validates and logs a batch', async () => {
    await asAdmin();
    const aud = must(await api.adminPushAudience(C, null));
    const bad = await api.adminPushCustom({ cohort_id: C, group_nos: null, title: 'x', body: 'y', url: 'https://example.com' });
    expect(bad.ok).toBe(false);
    const arch = await api.adminPushCustom({ cohort_id: MOCK_ARCHIVED_COHORT.id, group_nos: null, title: 'x', body: 'y', url: null });
    expect(arch.ok ? 'ok' : arch.error.code).toBe('cohort_archived');
    const sent = must(await api.adminPushCustom({ cohort_id: C, group_nos: null, title: 'Hello', body: 'Bring a laptop', url: '/#/lab' }));
    expect(sent.queued).toBe(aud.students);
    const log = must(await api.adminPushLog());
    expect(log[0]).toMatchObject({ kind: 'custom', title: 'Hello', total: aud.students, queued: aud.students });
    await api.adminPushSend();
    expect(must(await api.adminPushLog())[0]!.queued).toBe(0);
    await asStudent(5);
    expect(must(await api.listMyNotifications()).items[0]).toMatchObject({ title: 'Hello', url: '/#/lab', read_at: null });
  });

  it('a disabled kind enqueues nothing', async () => {
    await asAdmin();
    await api.adminSetPushKind('custom', false);
    expect(must(await api.adminPushCustom({ cohort_id: C, group_nos: null, title: 'Hello', body: 'b', url: null })).queued).toBe(0);
  });
});

describe('mock closures', () => {
  async function bookedDate(email?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const rows = must(await api.adminListLabBookings(today, to));
    return rows.find((r) => r.status === 'booked' && (!email || r.email === email))!.slot_start.slice(0, 10);
  }

  it('previews, withdraws future bookings and notifies the affected student', async () => {
    await asAdmin();
    const date = await bookedDate('student001@example.edu');
    const impact = must(await api.adminClosureImpact(date, date));
    expect(impact.bookings).toBeGreaterThan(0);
    expect(impact.students).toBeGreaterThan(0);
    const res = must(await api.adminAddClosures([{ date, kind: 'closed', reason: 'Power cut' }]));
    expect(res.withdrawn).toBe(impact.bookings);
    expect(must(await api.adminClosureImpact(date, date))).toEqual({ bookings: 0, students: 0 });
    await asStudent(1);
    const n = must(await api.listMyNotifications()).items.find((x) => x.kind === 'lab_closed');
    expect(n?.title).toMatch(/^Lab closed /);
    expect(n?.body).toMatch(/^Power cut\. Your booking \d\d:\d\d–\d\d:\d\d was cancelled and your credits returned\.$/);
  });

  it('ranges report withdrawn too', async () => {
    await asAdmin();
    const date = await bookedDate();
    const res = must(await api.adminAddClosureRange({ from: date, to: date, kind: 'closed', reason: null }));
    expect(res.withdrawn).toBeGreaterThan(0);
  });
});

describe('mock notify flags', () => {
  it('sets notify via publish and via class sessions', async () => {
    await asAdmin();
    const rows = must(await api.adminListContent('tutorial', C));
    const draft = rows.find((r) => r.status === 'draft')!;
    expect(draft.notify_on_release).toBe(false);
    const on = must(await api.adminSetContentPublish(draft.id, new Date(Date.now() + 86_400_000).toISOString(), true));
    expect(on.notify_on_release).toBe(true);
    expect(must(await api.adminSetContentPublish(draft.id, null)).notify_on_release).toBe(true);
    expect(must(await api.adminSetContentPublish(draft.id, null, false)).notify_on_release).toBe(false);

    const [s] = must(await api.adminListClassSessions(C));
    const input = {
      id: s!.id, cohort_id: C, date: s!.date, title: s!.title, slots: s!.slots, deliverables: s!.deliverables,
      lab_block_until: s!.lab_block_until, content_ids: [draft.id],
    };
    expect((await api.adminUpsertClassSession({ ...input, notify_content_ids: ['other'] })).ok).toBe(false);
    const saved = must(await api.adminUpsertClassSession({ ...input, notify_content_ids: [draft.id] }));
    expect(saved.content.find((c) => c.id === draft.id)?.notify).toBe(true);
    const again = must(await api.adminUpsertClassSession({ ...input, notify_content_ids: [] }));
    expect(again.content.find((c) => c.id === draft.id)?.notify).toBe(false);
  });
});
