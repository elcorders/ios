import type { ApiError, PushStats, Result, S16Api } from '../types';
import { getMockCurrentEmail } from './auth';
import { MOCK_USERS } from './fixtures/s1';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

interface Sub { id: string; userId: string; endpoint: string }
let subs: Sub[] = [];
let queued = 0;
let seq = 0;

const currentUser = () => MOCK_USERS.find((u) => u.profile.email === getMockCurrentEmail()) ?? null;

/** Test helper. */
export function resetMockPush(): void {
  subs = [];
  queued = 0;
  seq = 0;
}

export const mockPush: S16Api = {
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
    return ok({ devices: subs.filter((s) => s.userId === u.profile.id).length });
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
    return ok({ sent, failed: 0, skipped: 0, remaining: 0 });
  },
};
