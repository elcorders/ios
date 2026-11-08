import type { ApiError, Result, S2Api, SurveyOverview, SurveyOverviewRow, SurveySubmitResult } from '../types';
import { getMockCurrentEmail } from './auth';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS, seedEnrolments, type MockEnrolment } from './fixtures/s1';

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

const GROUP_COUNT = 6;

interface Answer {
  has_mac: boolean;
  submitted_at: string;
  group_no: number;
}

/** Fictional pre-answered students (index of the student number to answer). Everyone else is unanswered. */
const SEED_ANSWERS: [number, boolean][] = [[1, true], [2, false], [3, true], [5, false], [7, true]];

let enrolments: MockEnrolment[] = seedEnrolments();
let answers = new Map<string, Answer>();
/** S8: group of a student placed manually without a survey answer. */
let placed = new Map<string, number>();

const activeStudents = (cohortId: string) =>
  enrolments.filter((e) => e.cohort_id === cohortId && e.role === 'student' && e.status === 'active');

/** Same rule as CONTRACT S2: fewest same answer, then fewest total, then lowest group number. */
function pickGroup(cohortId: string, hasMac: boolean): number {
  const sized = Array.from({ length: GROUP_COUNT }, (_, i) => ({ no: i + 1, same: 0, total: 0 }));
  for (const e of activeStudents(cohortId)) {
    const a = answers.get(e.id);
    if (!a) continue;
    const g = sized[a.group_no - 1]!;
    g.total += 1;
    if (a.has_mac === hasMac) g.same += 1;
  }
  sized.sort((x, y) => x.same - y.same || x.total - y.total || x.no - y.no);
  return sized[0]!.no;
}

function record(e: MockEnrolment, hasMac: boolean, submittedAt: string): Answer {
  const a: Answer = { has_mac: hasMac, submitted_at: submittedAt, group_no: pickGroup(e.cohort_id, hasMac) };
  answers.set(e.id, a);
  return a;
}

function seedState(): void {
  enrolments = seedEnrolments();
  answers = new Map();
  placed = new Map();
  for (const [n, hasMac] of SEED_ANSWERS) {
    const email = `student${String(n).padStart(3, '0')}@example.edu`;
    const user = MOCK_USERS.find((u) => u.profile.email === email)!;
    const e = enrolments.find((x) => x.cohort_id === MOCK_COHORT.id && x.user_id === user.profile.id)!;
    record(e, hasMac, '2026-02-10T10:00:00+05:30');
  }
}
seedState();

/** Test helper: restore the seeded survey data. */
export function resetMockSurvey(): void {
  seedState();
}

/** Survey fields for get_me: instructors are always done, students depend on a stored answer. */
export function surveyInfoFor(enrolmentId: string, role: string): {
  survey_done: boolean;
  group_no: number | null;
  group_name: string | null;
} {
  if (role !== 'student') return { survey_done: true, group_no: null, group_name: null };
  const a = answers.get(enrolmentId);
  if (a) return { survey_done: true, group_no: a.group_no, group_name: `Group ${a.group_no}` };
  const p = placed.get(enrolmentId);
  return { survey_done: false, group_no: p ?? null, group_name: p ? `Group ${p}` : null };
}

export const MOCK_GROUP_COUNT = GROUP_COUNT;

/** S8: a student's current group and survey answer (null = none). */
export function mockGroupOf(enrolmentId: string): { group_no: number | null; has_mac: boolean | null } {
  const a = answers.get(enrolmentId);
  return a ? { group_no: a.group_no, has_mac: a.has_mac } : { group_no: placed.get(enrolmentId) ?? null, has_mac: null };
}

/** S8: move a student to another group (keeps the survey answer). */
export function mockSetGroup(enrolmentId: string, groupNo: number): void {
  const a = answers.get(enrolmentId);
  if (a) a.group_no = groupNo;
  else placed.set(enrolmentId, groupNo);
}

/** S8: active student enrolments of a cohort (shared with the transfers mock). */
export function mockActiveStudents(cohortId: string): MockEnrolment[] {
  return activeStudents(cohortId);
}

const currentUser = () => {
  const email = getMockCurrentEmail();
  return email ? MOCK_USERS.find((u) => u.profile.email === email) : undefined;
};

export const mockSurvey: S2Api = {
  async submitSurvey(cohortId, hasMac) {
    const user = currentUser();
    if (!user) return fail('not_authenticated');
    if (typeof hasMac !== 'boolean') return fail('invalid_input');
    const e = activeStudents(cohortId).find((x) => x.user_id === user.profile.id);
    if (!e) return fail('forbidden');
    if (cohortId === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    const a = answers.get(e.id) ?? record(e, hasMac, new Date().toISOString());
    const out: SurveySubmitResult = {
      has_mac: a.has_mac,
      submitted_at: a.submitted_at,
      group_no: a.group_no,
      group_name: `Group ${a.group_no}`,
    };
    return ok(out);
  },

  async adminListSurvey(cohortId) {
    const user = currentUser();
    if (!user) return fail('not_authenticated');
    const isInstructor = enrolments.some(
      (e) => e.cohort_id === cohortId && e.user_id === user.profile.id && e.role === 'instructor' && e.status === 'active',
    );
    if (!user.profile.is_admin && !isInstructor) return fail('forbidden');
    const rows: SurveyOverviewRow[] = activeStudents(cohortId).map((e) => {
      const p = MOCK_USERS.find((u) => u.profile.id === e.user_id)!.profile;
      const a = answers.get(e.id);
      return {
        enrolment_id: e.id,
        email: p.email,
        index_no: p.index_no,
        first_name: p.first_name,
        last_name: p.last_name,
        has_mac: a ? a.has_mac : null,
        submitted_at: a ? a.submitted_at : null,
        group_no: a ? a.group_no : null,
      };
    });
    rows.sort((x, y) => (x.index_no ?? '').localeCompare(y.index_no ?? '') || x.email.localeCompare(y.email));
    const answered = rows.filter((r) => r.has_mac !== null);
    const overview: SurveyOverview = {
      counts: {
        students: rows.length,
        answered: answered.length,
        has_mac: answered.filter((r) => r.has_mac).length,
        no_mac: answered.filter((r) => r.has_mac === false).length,
      },
      groups: Array.from({ length: GROUP_COUNT }, (_, i) => {
        const inGroup = answered.filter((r) => r.group_no === i + 1);
        return {
          no: i + 1,
          name: `Group ${i + 1}`,
          size: inGroup.length,
          has_mac: inGroup.filter((r) => r.has_mac).length,
          no_mac: inGroup.filter((r) => !r.has_mac).length,
        };
      }),
      rows,
    };
    return ok(overview);
  },
};
