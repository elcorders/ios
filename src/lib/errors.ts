import type { ApiError } from '../api/types';

const MESSAGES: Record<string, string> = {
  invalid_link: 'This link is not valid any more. Open it again from the LMS course page.',
  cohort_archived: 'This class has been archived, so it can no longer be changed.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  invalid_input: 'Some details are missing from the link. Open it again from the LMS course page.',
  invalid_code: 'That code is not correct. Check it and try again.',
  not_on_roster: 'This email is not on a class list. Use the link from the LMS or ask Fuzail.',
  passkey_unsupported: 'This browser or device cannot use passkeys. Try an email code instead.',
  passkey_cancelled: 'Passkey sign-in was cancelled.',
  not_authenticated: 'Please sign in first.',
  not_found: 'That record no longer exists. Refresh the page.',
  conflict: 'That clashes with an existing record (for example the index number is already used).',
  internal: 'Something went wrong on the server. Please try again.',
  forbidden: 'You do not have access to that.',
  not_eligible: 'Lab booking is only for students who do not have a Mac of their own.',
  lab_closed: 'Lab booking is not open yet.',
  suspended: 'Your lab booking is paused after missed sessions. Ask an instructor to clear it.',
  slot_past: 'That time has already started. Pick a later slot.',
  beyond_horizon: 'That day is too far ahead to book yet.',
  slot_closed: 'The lab is closed at that time.',
  slot_full: 'That slot just filled up. Pick another one.',
  already_booked: 'You already have a booking at that time.',
  no_credits: 'You do not have enough lab credits left for these slots.',
  weekly_cap: 'That would go over your weekly lab hours limit.',
  too_late: 'That session has already started, so it cannot be withdrawn.',
};

/** Friendly message chosen by `error.code`, never by backend text. */
export function messageFor(error: ApiError | { code: string }): string {
  return MESSAGES[error.code] ?? 'Something went wrong. Please try again.';
}
