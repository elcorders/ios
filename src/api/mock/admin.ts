import type {
  AdminCohort, Api, ApiError, Cohort, Member, PendingRegistration, Profile, Result,
} from '../types';
import { getMockCurrentEmail } from './auth';
import {
  MOCK_ARCHIVED_COHORT, MOCK_ARCHIVED_COURSE_KEY, MOCK_COHORT, MOCK_COURSE_KEY, MOCK_USERS,
  seedEnrolments, seedPending, type MockEnrolment,
} from './fixtures/s1';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

interface State {
  cohorts: (Cohort & { course_key: string })[];
  profiles: Map<string, Profile>;
  security: Map<string, { passkeys: number; totp: boolean }>;
  enrolments: MockEnrolment[];
  pending: PendingRegistration[];
}

function seed(): State {
  return {
    cohorts: [
      { ...MOCK_COHORT, settings: { ...MOCK_COHORT.settings }, course_key: MOCK_COURSE_KEY },
      { ...MOCK_ARCHIVED_COHORT, settings: { ...MOCK_ARCHIVED_COHORT.settings }, course_key: MOCK_ARCHIVED_COURSE_KEY },
    ],
    profiles: new Map(MOCK_USERS.map((u) => [u.profile.id, { ...u.profile }])),
    security: new Map(MOCK_USERS.map((u) => [u.profile.id, { ...u.security }])),
    enrolments: seedEnrolments(),
    pending: seedPending(),
  };
}

let state = seed();

/** Test helper: restore the seeded admin data. */
export function resetMockAdmin(): void {
  state = seed();
}

const isAdmin = (): boolean => {
  const email = getMockCurrentEmail();
  return !!email && MOCK_USERS.some((u) => u.profile.email === email && u.profile.is_admin);
};

const cohortOf = (id: string) => state.cohorts.find((c) => c.id === id);

function toMember(e: MockEnrolment): Member {
  const p = state.profiles.get(e.user_id)!;
  const sec = state.security.get(e.user_id) ?? { passkeys: 0, totp: false };
  return {
    enrolment_id: e.id,
    user_id: e.user_id,
    role: e.role,
    status: e.status,
    email: p.email,
    index_no: p.index_no,
    lms_username: p.lms_username,
    first_name: p.first_name,
    last_name: p.last_name,
    phone: p.phone,
    security: { ...sec },
    last_sign_in_at: e.status === 'active' && sec.passkeys + (sec.totp ? 1 : 0) > 0 ? '2026-03-02T08:15:00+00:00' : null,
  };
}

function toAdminCohort(c: Cohort & { course_key: string }): AdminCohort {
  const active = state.enrolments.filter((e) => e.cohort_id === c.id && e.status === 'active');
  return {
    ...c,
    settings: { ...c.settings },
    counts: {
      students: active.filter((e) => e.role === 'student').length,
      instructors: active.filter((e) => e.role === 'instructor').length,
      pending: state.pending.filter((p) => p.cohort_id === c.id && p.status === 'pending').length,
    },
  };
}

function guard<A extends unknown[], T>(fn: (...args: A) => Result<T>) {
  return async (...args: A): Promise<Result<T>> => (isAdmin() ? fn(...args) : fail('forbidden'));
}

type AdminMethods = Pick<
  Api,
  | 'adminListCohorts' | 'adminUpsertCohort' | 'adminUpdateCohortSettings' | 'listMembers'
  | 'adminUpdateProfile' | 'adminSetEnrolmentStatus' | 'adminListPending' | 'approvePending'
  | 'rejectPending' | 'adminResetSecurity'
>;

export const mockAdmin: Partial<Api> & AdminMethods = {
  adminListCohorts: guard(() => ok(state.cohorts.map(toAdminCohort))),

  adminUpsertCohort: guard((input) => {
    if (!input.code.trim() || !input.batch.trim() || !input.lms_course_id.trim()) return fail('invalid_input');
    const clash = state.cohorts.some(
      (c) => c.id !== input.id && (c.code === input.code || c.lms_course_id === input.lms_course_id),
    );
    if (clash) return fail('conflict');
    const existing = input.id ? cohortOf(input.id) : undefined;
    if (input.id && !existing) return fail('not_found');
    if (existing) {
      Object.assign(existing, {
        code: input.code, batch: input.batch, lms_course_id: input.lms_course_id,
        course_key: input.course_key, status: input.status,
      });
      return ok({ ...existing, settings: { ...existing.settings } });
    }
    const created = {
      id: `00000000-0000-4000-8000-0000000003${String(state.cohorts.length).padStart(2, '0')}`,
      code: input.code, batch: input.batch, lms_course_id: input.lms_course_id, status: input.status,
      settings: { whatsapp_link: null }, created_at: '2026-06-01T09:00:00+05:30', course_key: input.course_key,
    };
    state.cohorts.push(created);
    return ok({ ...created });
  }),

  adminUpdateCohortSettings: guard((cohortId, patch) => {
    const c = cohortOf(cohortId);
    if (!c) return fail('not_found');
    if (c.status === 'archived') return fail('cohort_archived');
    const link = patch.whatsapp_link;
    if (link != null && !link.startsWith('https://chat.whatsapp.com/')) return fail('invalid_input');
    c.settings = { ...c.settings, ...patch };
    return ok({ ...c.settings });
  }),

  listMembers: guard((cohortId, role) => {
    if (!cohortOf(cohortId)) return fail('not_found');
    const rows = state.enrolments
      .filter((e) => e.cohort_id === cohortId && (!role || e.role === role))
      .map(toMember)
      .sort((a, b) => (a.index_no ?? '').localeCompare(b.index_no ?? '') || a.email.localeCompare(b.email));
    return ok(rows);
  }),

  adminUpdateProfile: guard((input) => {
    const p = state.profiles.get(input.user_id);
    if (!p) return fail('not_found');
    if (!input.first_name.trim() || !input.last_name.trim()) return fail('invalid_input');
    if (input.phone && !/^\+94\d{9}$/.test(input.phone)) return fail('invalid_input');
    if (input.index_no) {
      for (const other of state.profiles.values()) {
        if (other.id !== p.id && other.index_no === input.index_no) return fail('conflict');
      }
    }
    Object.assign(p, {
      first_name: input.first_name.trim(), last_name: input.last_name.trim(),
      index_no: input.index_no || null, lms_username: input.lms_username || null,
      phone: input.phone || null, updated_at: '2026-06-01T09:00:00+05:30',
    });
    return ok({ ...p });
  }),

  adminSetEnrolmentStatus: guard((enrolmentId, status) => {
    const e = state.enrolments.find((x) => x.id === enrolmentId);
    if (!e) return fail('not_found');
    if (cohortOf(e.cohort_id)?.status === 'archived') return fail('cohort_archived');
    e.status = status;
    return ok({ id: e.id, status });
  }),

  adminListPending: guard((cohortId) => {
    if (!cohortOf(cohortId)) return fail('not_found');
    return ok(state.pending.filter((p) => p.cohort_id === cohortId).map((p) => ({ ...p })));
  }),

  approvePending: guard((pendingId) => {
    const row = state.pending.find((p) => p.id === pendingId);
    if (!row) return fail('not_found');
    if (row.status !== 'pending') return fail('conflict');
    const now = '2026-06-01T09:00:00+05:30';
    let profile = [...state.profiles.values()].find((p) => p.email === row.email);
    if (!profile) {
      profile = {
        id: `00000000-0000-4000-8000-0000000008${String(state.profiles.size).padStart(2, '0')}`,
        email: row.email, index_no: row.idnumber, lms_username: row.lms_username,
        first_name: row.first_name ?? '', last_name: row.last_name ?? '', phone: null,
        whatsapp_opt_in: false, is_admin: false, created_at: now, updated_at: now,
      };
      state.profiles.set(profile.id, profile);
      state.security.set(profile.id, { passkeys: 0, totp: false });
    }
    const userId = profile.id;
    let enrolment = state.enrolments.find((e) => e.cohort_id === row.cohort_id && e.user_id === userId);
    if (enrolment) enrolment.status = 'active';
    else {
      enrolment = { id: `enrol-${userId}`, cohort_id: row.cohort_id, user_id: userId, role: 'student', status: 'active' };
      state.enrolments.push(enrolment);
    }
    row.status = 'approved';
    row.decided_at = now;
    return ok({ member: toMember(enrolment) });
  }),

  rejectPending: guard((pendingId) => {
    const row = state.pending.find((p) => p.id === pendingId);
    if (!row) return fail('not_found');
    if (row.status !== 'pending') return fail('conflict');
    row.status = 'rejected';
    row.decided_at = '2026-06-01T09:00:00+05:30';
    return ok({ ...row });
  }),

  adminResetSecurity: guard((userId, what) => {
    const sec = state.security.get(userId);
    if (!sec) return fail('not_found');
    const removePasskeys = what === 'passkeys' || what === 'all';
    const removeTotp = (what === 'totp' || what === 'all') && sec.totp;
    const result = { passkeys_removed: removePasskeys ? sec.passkeys : 0, totp_removed: removeTotp };
    if (removePasskeys) sec.passkeys = 0;
    if (removeTotp) sec.totp = false;
    return ok(result);
  }),
};
