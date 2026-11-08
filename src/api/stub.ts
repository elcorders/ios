import type { S1Api, S2Api, S6Api, S7Api, S8Api, S9Api, S10Api, S3Api } from './types';

type SliceApi = S1Api & S2Api & S6Api & S7Api & S8Api & S9Api & S10Api & S3Api;

/** Placeholder for methods a slice's F (mock) or I (supabase) task has not implemented yet. */
const S1_METHODS = [
  'lmsLanding', 'sendEmailCode', 'verifyEmailCode', 'registerPasskey', 'signInWithPasskey',
  'totpEnrol', 'totpVerify', 'totpLogin', 'signOut', 'getMe',
  'adminListCohorts', 'adminUpsertCohort', 'adminUpdateCohortSettings',
  'listMembers', 'adminUpdateProfile', 'adminSetEnrolmentStatus',
  'rosterImport', 'adminListPending', 'approvePending', 'rejectPending', 'adminResetSecurity',
  // S2
  'submitSurvey', 'adminListSurvey',
  // S6
  'listContent', 'getContent', 'adminListContent', 'adminGetContent', 'adminUpsertContent',
  'adminSetContentPublish', 'adminDeleteContent', 'adminCopyTutorials',
  // S7
  'adminSetPendingStatus',
  // S8
  'getMyTransfers', 'requestTransfer', 'cancelTransfer', 'adminListTransfers', 'adminDecideTransfer',
  'adminApproveSwap', 'adminMoveStudent', 'adminSendOutbox',
  // S9
  'adminChangeEmail',
  // S10
  'adminResetSurvey',
  // S3
  'getLabCalendar', 'getMyLab', 'bookSlots', 'withdrawBooking', 'setPreferredMac',
  'adminListMacs', 'adminUpsertMac', 'getLabHours', 'adminSetLabHours',
  'listClosures', 'adminAddClosures', 'adminDeleteClosure',
  'adminListLabBookings', 'adminLabCredits', 'adminAdjustCredits', 'adminClearSuspension',
] as const satisfies readonly (keyof SliceApi)[];

// Compile-time check that S1_METHODS lists every slice method.
type Missing = Exclude<keyof SliceApi, (typeof S1_METHODS)[number]>;
const allListed: Missing extends never ? true : Missing = true;
void allListed;

export function notImplemented(adapter: string): SliceApi {
  return Object.fromEntries(
    S1_METHODS.map((m) => [
      m,
      () => Promise.resolve({ ok: false, error: { code: 'not_implemented', message: `${adapter}.${m} is not implemented yet` } }),
    ]),
  ) as unknown as SliceApi;
}
