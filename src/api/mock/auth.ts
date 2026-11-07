import type { ApiError, Me, Result, S1Api } from '../types';
import { MOCK_CODE, MOCK_COHORT, MOCK_COURSE_KEY, MOCK_USERS, type MockUser } from './fixtures/s1';
import { getMockCohortWhatsApp, resetMockCohortState } from './cohortState';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string, message = code): Result<T> => ({ ok: false, error: { code, message } satisfies ApiError });

let currentEmail: string | null = null;
const pendingEmails = new Set<string>();

/** Test helper: forget the signed-in user and recorded pending registrations. */
export function resetMockAuth(): void {
  currentEmail = null;
  pendingEmails.clear();
  securityOverrides.clear();
  resetMockCohortState();
}

const securityOverrides = new Map<string, Partial<MockUser['security']>>();

/** Mock helper: record security factors for the signed-in user. Null when nobody is signed in. */
export function updateCurrentMockSecurity(change: { addPasskey?: boolean; totp?: boolean }): boolean {
  if (!currentEmail) return false;
  const prev = securityOverrides.get(currentEmail) ?? {};
  const base = findByEmail(currentEmail)?.security;
  if (!base) return false;
  securityOverrides.set(currentEmail, {
    passkeys: (prev.passkeys ?? base.passkeys) + (change.addPasskey ? 1 : 0),
    totp: change.totp ?? prev.totp ?? base.totp,
  });
  return true;
}

/** Email of the signed-in mock user (read by other mock modules). */
export const getMockCurrentEmail = (): string | null => currentEmail;

const findByEmail = (email: string): MockUser | undefined =>
  MOCK_USERS.find((u) => u.profile.email === email.trim().toLowerCase());

function toMe(u: MockUser): Me {
  const sec = { ...u.security, ...securityOverrides.get(u.profile.email) };
  return {
    profile: u.profile,
    is_admin: u.profile.is_admin,
    enrolments: u.role
      ? [{
          enrolment_id: `enrol-${u.profile.id}`,
          cohort_id: MOCK_COHORT.id,
          cohort_code: MOCK_COHORT.code,
          cohort_status: MOCK_COHORT.status,
          role: u.role,
          status: 'active',
          whatsapp_link: getMockCohortWhatsApp(MOCK_COHORT.id) ?? MOCK_COHORT.settings.whatsapp_link,
          // S2 fields: survey state is mocked in S2.F1; until then nobody is gated.
          survey_done: true,
          group_no: null,
          group_name: null,
        }]
      : [],
    security: { passkeys: sec.passkeys, totp: sec.totp, setup_complete: sec.passkeys > 0 || sec.totp },
  };
}

type AuthMethods = Pick<
  S1Api,
  'lmsLanding' | 'sendEmailCode' | 'verifyEmailCode' | 'signInWithPasskey' | 'totpLogin' | 'signOut' | 'getMe'
>;

export const mockAuth: AuthMethods = {
  async lmsLanding(p) {
    if (!p.email?.trim()) return fail('invalid_input');
    if (p.course_id !== MOCK_COHORT.lms_course_id || p.key !== MOCK_COURSE_KEY) return fail('invalid_link');
    const students = MOCK_USERS.filter((u) => u.role);
    const match =
      (p.idnumber ? students.find((u) => u.profile.index_no === p.idnumber) : undefined) ??
      (p.username ? students.find((u) => u.profile.lms_username === p.username) : undefined) ??
      findByEmail(p.email);
    if (match && match.role) return ok({ status: 'roster', cohort_code: MOCK_COHORT.code, email: match.profile.email });
    pendingEmails.add(p.email.trim().toLowerCase());
    return ok({ status: 'pending', cohort_code: MOCK_COHORT.code, email: p.email.trim().toLowerCase() });
  },
  async sendEmailCode(email) {
    return findByEmail(email) ? ok(undefined) : fail('not_on_roster');
  },
  async verifyEmailCode(email, code) {
    const u = findByEmail(email);
    if (!u) return fail('not_on_roster');
    if (code !== MOCK_CODE) return fail('invalid_code');
    currentEmail = u.profile.email;
    return ok(undefined);
  },
  async signInWithPasskey() {
    currentEmail = 'student001@example.edu';
    return ok(undefined);
  },
  async totpLogin(email, code) {
    const u = findByEmail(email);
    if (!u || code !== MOCK_CODE) return fail('invalid_code');
    currentEmail = u.profile.email;
    return ok(undefined);
  },
  async signOut() {
    currentEmail = null;
    return ok(undefined);
  },
  async getMe() {
    const u = currentEmail ? findByEmail(currentEmail) : undefined;
    return u ? ok(toMe(u)) : fail('not_authenticated');
  },
};
