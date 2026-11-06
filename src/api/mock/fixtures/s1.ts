import type { Cohort, EnrolmentRole, Profile } from '../../types';

/** Fictional data only. */
export const MOCK_COHORT: Cohort = {
  id: '00000000-0000-4000-8000-000000000252',
  code: '25.2',
  batch: 'BSCCOMP25.2P',
  lms_course_id: '12345',
  status: 'active',
  settings: { whatsapp_link: null },
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
  user(50, { email: 'instructor001@example.edu', first_name: 'Test', last_name: 'Instructor' }, 'instructor', { passkeys: 1, totp: false }),
  user(90, { email: 'admin@example.edu', first_name: 'Test', last_name: 'Admin', is_admin: true }, null, { passkeys: 1, totp: false }),
];

export const MOCK_CODE = '123456';
