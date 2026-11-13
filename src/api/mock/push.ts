import type { ApiError, MyNotification, PushKind, PushLogRow, PushStats, Result, S16Api, S19Api } from '../types';
import { getMockCurrentEmail } from './auth';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS } from './fixtures/s1';
import { mockActiveStudents, mockGroupOf } from './survey';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

interface Sub { id: string; userId: string; endpoint: string }
let subs: Sub[] = [];
let queued = 0;
let seq = 0;

const KINDS: PushKind[] = [
  'class_reminder', 'content_released', 'booking_confirmed', 'booking_reminder', 'booking_soon',
  'group_changed', 'lab_closed', 'no_show', 'custom',
];
let enabled = new Map<PushKind, boolean>();
let inbox = new Map<string, MyNotification[]>();
let logRows: PushLogRow[] = [];
let nid = 0;

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const newNid = () => `00000000-0000-4000-8000-0000000190${String(++nid).padStart(2, '0')}`;

/** Fictional placeholder booking id used by the seeded reminder link. */
export const MOCK_REMINDER_BOOKING_ID = '00000000-0000-4000-8000-000000004999';

function seedInbox(): void {
  const s5 = MOCK_USERS.find((u) => u.profile.email === 'student005@example.edu');
  inbox = new Map();
  nid = 0;
  if (!s5) return;
  const row = (kind: PushKind, title: string, body: string, url: string | null, ageMin: number, read: boolean): MyNotification => ({
    id: newNid(), kind, title, body, url, created_at: ago(ageMin * MIN), read_at: read ? ago((ageMin - 1) * MIN) : null,
  });
  inbox.set(s5.profile.id, [
    row('class_reminder', 'Class tomorrow: Tutorial 2 — Layouts (fictional)', '09:00–12:00. Deliverables: Layout screenshot.', '/#/', 30, false),
    row('booking_reminder', 'Lab tomorrow 14:00–16:00', 'Not going? Withdraw so someone else can use the Mac.', `/#/lab?b=${MOCK_REMINDER_BOOKING_ID}`, 120, false),
    row('content_released', 'New tutorial: Tutorial 1 (fictional)', 'Open it in the app.', '/#/tutorials', 60 * 26, true),
    row('group_changed', 'Group changed', "You're now in Group 2.", '/#/', 60 * 24 * 5, true),
  ]);
}
seedInbox();

function resetSwitches(): void {
  enabled = new Map(KINDS.map((k) => [k, true]));
}
resetSwitches();

/** For other mocks (lab closures): add an inbox row unless the kind is switched off. */
export function mockEnqueueNotification(userId: string, kind: PushKind, title: string, body: string, url: string | null): boolean {
  if (kind !== 'test' && enabled.get(kind) === false) return false;
  const list = inbox.get(userId) ?? [];
  list.unshift({ id: newNid(), kind, title: title.slice(0, 100), body: body.length > 300 ? `${body.slice(0, 299)}…` : body, url, created_at: new Date().toISOString(), read_at: null });
  inbox.set(userId, list);
  const minute = new Date().toISOString().slice(0, 16);
  const batch = logRows.find((r) => r.kind === kind && r.title === title && r.created_at.slice(0, 16) === minute);
  if (batch) {
    batch.total += 1;
    batch.queued += 1;
  } else logRows.unshift({ kind, title, created_at: new Date().toISOString(), total: 1, sent: 0, failed: 0, skipped: 0, queued: 1 });
  return true;
}

const currentUser = () => MOCK_USERS.find((u) => u.profile.email === getMockCurrentEmail()) ?? null;

/** Test helper. */
export function resetMockPush(): void {
  subs = [];
  queued = 0;
  seq = 0;
  resetSwitches();
  logRows = [];
  seedInbox();
}

function audienceUsers(cohortId: string, groupNos: number[] | null): string[] {
  return [...mockActiveStudents(cohortId)]
    .filter((e) => groupNos === null || groupNos.includes(mockGroupOf(e.id).group_no ?? -1))
    .map((e) => e.user_id);
}
let closureImpactHook: (from: string, to: string) => { bookings: number; students: number } = () => ({ bookings: 0, students: 0 });
/** Lab mock registers its impact calculation here (avoids an import cycle). */
export function setClosureImpactHook(fn: typeof closureImpactHook): void {
  closureImpactHook = fn;
}
const unreadOf = (userId: string) => (inbox.get(userId) ?? []).filter((n) => n.read_at === null).length;

export const mockPush: S16Api & S19Api = {
  async savePushSubscription(sub) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000 || !sub.p256dh || !sub.auth) return fail('invalid_input');
    const existing = subs.find((s) => s.endpoint === sub.endpoint);
    if (existing) {
      existing.userId = u.profile.id;
      return ok({ id: existing.id });
    }
    const id = `00000000-0000-4000-8000-0000000160${String(++seq).padStart(2, '0')}`;
    subs.push({ id, userId: u.profile.id, endpoint: sub.endpoint });
    return ok({ id });
  },
  async deletePushSubscription(endpoint) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    subs = subs.filter((s) => !(s.endpoint === endpoint && s.userId === u.profile.id));
    return ok({ ok: true as const });
  },
  async getMyPush() {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    return ok({ devices: subs.filter((s) => s.userId === u.profile.id).length, unread: unreadOf(u.profile.id) });
  },
  async adminPushStats() {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    const students = MOCK_USERS.filter((x) => x.role === 'student');
    const ids = new Set(students.map((x) => x.profile.id));
    return ok<PushStats>({
      users: new Set(subs.map((s) => s.userId)).size,
      devices: subs.length,
      students: students.length,
      students_with_push: new Set(subs.filter((s) => ids.has(s.userId)).map((s) => s.userId)).size,
      queued,
      kinds: KINDS.map((kind) => ({ kind, enabled: enabled.get(kind) !== false })),
    });
  },
  async adminPushTest() {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    if (!subs.some((s) => s.userId === u.profile.id)) return fail('no_devices');
    queued += 1;
    return ok({ queued: 1 });
  },
  async adminPushSend() {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    const sent = queued > 0 ? subs.filter((s) => s.userId === u.profile.id).length : 0;
    queued = 0;
    for (const r of logRows) {
      r.skipped += r.queued;
      r.queued = 0;
    }
    return ok({ sent, failed: 0, skipped: 0, remaining: 0 });
  },
  async listMyNotifications(before) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    const all = [...(inbox.get(u.profile.id) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const filtered = before ? all.filter((n) => n.created_at < before) : all;
    return ok({ items: filtered.slice(0, 30), has_more: filtered.length > 30 });
  },
  async markNotificationsRead(ids) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    let updated = 0;
    for (const n of inbox.get(u.profile.id) ?? []) {
      if (n.read_at === null && (ids === null || ids.includes(n.id))) {
        n.read_at = new Date().toISOString();
        updated += 1;
      }
    }
    return ok({ updated });
  },
  async adminSetPushKind(kind, on) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    if (!KINDS.includes(kind)) return fail('invalid_input');
    enabled.set(kind, on);
    return ok({ kind, enabled: on });
  },
  async adminPushAudience(cohortId, groupNos) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    if (![MOCK_COHORT.id, MOCK_ARCHIVED_COHORT.id].includes(cohortId)) return fail('not_found');
    if (groupNos !== null && (!Array.isArray(groupNos) || groupNos.length === 0)) return fail('invalid_input');
    const users = audienceUsers(cohortId, groupNos);
    return ok({ students: users.length, with_push: users.filter((id) => subs.some((s) => s.userId === id)).length });
  },
  async adminPushCustom(input) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || title.length > 100 || !body || body.length > 300) return fail('invalid_input');
    if (input.url !== null && !input.url.startsWith('/#/')) return fail('invalid_input');
    if (input.group_nos !== null && input.group_nos.length === 0) return fail('invalid_input');
    if (![MOCK_COHORT.id, MOCK_ARCHIVED_COHORT.id].includes(input.cohort_id)) return fail('not_found');
    if (input.cohort_id === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    const users = audienceUsers(input.cohort_id, input.group_nos);
    let queuedNow = 0;
    for (const id of users) if (mockEnqueueNotification(id, 'custom', title, body, input.url)) queuedNow += 1;
    queued += queuedNow;
    return ok({ queued: queuedNow, with_push: users.filter((id) => subs.some((s) => s.userId === id)).length });
  },
  async adminPushLog() {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    return ok(logRows.slice(0, 50).map((r) => ({ ...r })));
  },
  async adminClosureImpact(from, to) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin && u.role !== 'instructor') return fail('forbidden');
    return ok(closureImpactHook(from, to));
  },
};
