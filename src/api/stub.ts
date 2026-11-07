import type { S1Api, S2Api } from './types';

/** Placeholder for methods a slice's F (mock) or I (supabase) task has not implemented yet. */
const S1_METHODS = [
  'lmsLanding', 'sendEmailCode', 'verifyEmailCode', 'registerPasskey', 'signInWithPasskey',
  'totpEnrol', 'totpVerify', 'totpLogin', 'signOut', 'getMe',
  'adminListCohorts', 'adminUpsertCohort', 'adminUpdateCohortSettings',
  'listMembers', 'adminUpdateProfile', 'adminSetEnrolmentStatus',
  'rosterImport', 'adminListPending', 'approvePending', 'rejectPending', 'adminResetSecurity',
  // S2
  'getMySurvey', 'submitSurvey', 'adminListSurvey', 'adminUpdateSurvey', 'adminSetTier',
  'getGrouping', 'groupingPreview', 'groupingPin', 'groupingLock', 'groupingUnlock', 'adminSetGroup',
] as const satisfies readonly (keyof (S1Api & S2Api))[];

// Compile-time check that S1_METHODS lists every S1Api + S2Api method.
type Missing = Exclude<keyof (S1Api & S2Api), (typeof S1_METHODS)[number]>;
const allListed: Missing extends never ? true : Missing = true;
void allListed;

export function notImplemented(adapter: string): S1Api & S2Api {
  return Object.fromEntries(
    S1_METHODS.map((m) => [
      m,
      () => Promise.resolve({ ok: false, error: { code: 'not_implemented', message: `${adapter}.${m} is not implemented yet` } }),
    ]),
  ) as unknown as S1Api & S2Api;
}
