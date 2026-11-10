import type { Cohort, EnrolmentRole, EnrolmentStatus, PendingRegistration, Profile } from '../../types';

/** Fictional data only. */
export const MOCK_COHORT: Cohort = {
  id: '00000000-0000-4000-8000-000000000252',
  code: '25.2',
  batch: 'BSCCOMP25.2P',
  lms_course_id: '12345',
  status: 'active',
  settings: { whatsapp_link: null, lab_open: true },
  created_at: '2026-01-05T09:00:00+05:30',
};
export const MOCK_COURSE_KEY = 'dev-key-25-2';

export interface MockUser {
  profile: Profile;
  role: EnrolmentRole | null; // null = admin without an enrolment
  security: { passkeys: number; totp: boolean };
}

function user(n: number, over: Partial<Profile>, role: EnrolmentRole | null, security: MockUser['security']): MockUser {
  const id = `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
  return {
    role,
    security,
    profile: {
      id,
      email: '',
      index_no: null,
      lms_username: null,
      first_name: '',
      last_name: '',
      phone: null,
      whatsapp_opt_in: false,
      is_admin: false,
      created_at: '2026-01-05T09:00:00+05:30',
      updated_at: '2026-01-05T09:00:00+05:30',
      ...over,
    },
  };
}

const student = (n: number, security: MockUser['security']) => {
  const nn = String(n).padStart(3, '0');
  return user(n, {
    email: `student${nn}@example.edu`,
    index_no: `COBSCCOMP251P-${nn}`,
    lms_username: `COBSCCOMP251P-${nn}`,
    first_name: `Test${nn}`,
    last_name: 'Student',
  }, 'student', security);
};

export const MOCK_USERS: MockUser[] = [
  student(1, { passkeys: 1, totp: false }), // setup complete
  student(2, { passkeys: 0, totp: false }), // setup incomplete (security gate)
  student(3, { passkeys: 0, totp: true }),
  ...Array.from({ length: 9 }, (_, i) => student(i + 4, { passkeys: i % 2, totp: i % 3 === 0 })),
  user(50, { email: 'instructor001@example.edu', first_name: 'Test', last_name: 'Instructor' }, 'instructor', { passkeys: 1, totp: false }),
  user(51, { email: 'instructor002@example.edu', first_name: 'Second', last_name: 'Instructor' }, 'instructor', { passkeys: 0, totp: false }),
  user(90, { email: 'admin@example.edu', first_name: 'Test', last_name: 'Admin', is_admin: true }, null, { passkeys: 1, totp: false }),
];

export const MOCK_CODE = '123456';

/** Archived earlier cohort (read-only in the admin UI). */
export const MOCK_ARCHIVED_COHORT: Cohort = {
  id: '00000000-0000-4000-8000-000000000251',
  code: '25.1',
  batch: 'BSCCOMP25.1P',
  lms_course_id: '12300',
  status: 'archived',
  settings: { whatsapp_link: null },
  created_at: '2025-07-01T09:00:00+05:30',
};
export const MOCK_ARCHIVED_COURSE_KEY = 'dev-key-25-1';

export interface MockEnrolment {
  id: string;
  cohort_id: string;
  user_id: string;
  role: EnrolmentRole;
  status: EnrolmentStatus;
}

const idOf = (email: string) => MOCK_USERS.find((u) => u.profile.email === email)!.profile.id;

export function seedEnrolments(): MockEnrolment[] {
  const current = MOCK_USERS.filter((u) => u.role).map((u, i) => ({
    id: `enrol-${u.profile.id}`,
    cohort_id: MOCK_COHORT.id,
    user_id: u.profile.id,
    role: u.role!,
    status: (i === 8 ? 'removed' : 'active') as EnrolmentStatus,
  }));
  const archived = ['student001@example.edu', 'student002@example.edu'].map((email, i) => ({
    id: `enrol-old-${i + 1}`,
    cohort_id: MOCK_ARCHIVED_COHORT.id,
    user_id: idOf(email),
    role: 'student' as const,
    status: 'active' as const,
  }));
  return [...current, ...archived];
}

export function seedPending(): PendingRegistration[] {
  const row = (n: number, over: Partial<PendingRegistration>): PendingRegistration => ({
    id: `00000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`,
    cohort_id: MOCK_COHORT.id,
    email: `student0${60 + n}@example.edu`,
    idnumber: `COBSCCOMP251P-0${60 + n}`,
    lms_username: `COBSCCOMP251P-0${60 + n}`,
    first_name: `Late${n}`,
    last_name: 'Student',
    status: 'pending',
    created_at: `2026-02-0${n}T10:00:00+05:30`,
    decided_at: null,
    decided_by: null,
    ...over,
  });
  return [
    row(1, {}),
    row(2, {}),
    row(3, { status: 'rejected', decided_at: '2026-02-04T09:00:00+05:30' }),
  ];
}
