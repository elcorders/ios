/** Shared API conventions. Slice types are added by the coordinator. */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** ISO 8601 date-time with offset, e.g. 2026-01-15T09:30:00+05:30. */
export type IsoDateTime = string;

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface CoreApi {
  health(): Promise<Result<{ adapter: 'mock' | 'supabase'; ok: boolean }>>;
}

/** Full API surface; each slice adds its interface here (CONTRACT.md). */
export type Api = CoreApi & S1Api & S2Api;

// ───────────────────────── S1 — Auth, cohorts, roster (CONTRACT.md §S1) ─────────────────────────

export type Uuid = string;
export type CohortStatus = 'active' | 'archived';
export type EnrolmentRole = 'student' | 'instructor';
export type EnrolmentStatus = 'active' | 'removed';
export type PendingStatus = 'pending' | 'approved' | 'rejected';

export interface CohortSettings {
  whatsapp_link: string | null;
  /** S2: default group count (absent → 6). */
  group_count?: number;
  /** S2: own Mac with macOS major ≥ this → tier A (absent → 15). */
  tier_a_min_macos?: number;
}

export interface Cohort {
  id: Uuid;
  code: string;
  batch: string;
  lms_course_id: string;
  status: CohortStatus;
  settings: CohortSettings;
  created_at: IsoDateTime;
}

export interface AdminCohort extends Cohort {
  course_key: string;
  counts: { students: number; instructors: number; pending: number };
}

export interface Profile {
  id: Uuid;
  email: string;
  index_no: string | null;
  lms_username: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  whatsapp_opt_in: boolean;
  is_admin: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface SecurityStatus {
  passkeys: number;
  totp: boolean;
  setup_complete: boolean;
}

export interface MyEnrolment {
  enrolment_id: Uuid;
  cohort_id: Uuid;
  cohort_code: string;
  cohort_status: CohortStatus;
  role: EnrolmentRole;
  status: EnrolmentStatus;
  whatsapp_link: string | null;
  /** S2: student has a survey response (always true for instructors). */
  survey_done: boolean;
  mac_tier: MacTier | null;
  /** S2: only while the cohort's grouping is locked. */
  group_no: number | null;
  group_name: string | null;
}

export interface Me {
  profile: Profile;
  is_admin: boolean;
  enrolments: MyEnrolment[];
  security: SecurityStatus;
}

export interface LmsLandingParams {
  key: string;
  course_id: string;
  idnumber?: string;
  username?: string;
  email: string;
  first?: string;
  last?: string;
}

export interface LmsLandingResult {
  status: 'roster' | 'pending';
  cohort_code: string;
  /** Roster email (code is sent here) or, for pending, the LMS email. */
  email: string;
}

export interface Member {
  enrolment_id: Uuid;
  user_id: Uuid;
  role: EnrolmentRole;
  status: EnrolmentStatus;
  email: string;
  index_no: string | null;
  lms_username: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  security: { passkeys: number; totp: boolean };
  last_sign_in_at: IsoDateTime | null;
}

export interface UpsertCohortInput {
  id: Uuid | null;
  code: string;
  batch: string;
  lms_course_id: string;
  course_key: string;
  status: CohortStatus;
}

export interface UpdateProfileInput {
  user_id: Uuid;
  first_name: string;
  last_name: string;
  index_no: string | null;
  lms_username: string | null;
  phone: string | null;
}

export interface RosterRow {
  index_no?: string;
  email: string;
  first_name: string;
  last_name: string;
  lms_username?: string;
  phone?: string;
}

export type RosterRowErrorCode =
  | 'invalid_email'
  | 'missing_name'
  | 'index_conflict'
  | 'duplicate_in_file'
  | 'invalid_phone';

export interface RosterImportInput {
  cohort_id: Uuid;
  role: EnrolmentRole;
  dry_run: boolean;
  rows: RosterRow[];
}

export interface RosterImportResult {
  dry_run: boolean;
  add: RosterRow[];
  update: { row: RosterRow; changes: Record<string, [unknown, unknown]> }[];
  unchanged: number;
  not_in_file: Member[];
  errors: { row_index: number; code: RosterRowErrorCode; message: string }[];
  applied: boolean;
}

export interface PendingRegistration {
  id: Uuid;
  cohort_id: Uuid;
  email: string;
  idnumber: string | null;
  lms_username: string | null;
  first_name: string | null;
  last_name: string | null;
  status: PendingStatus;
  created_at: IsoDateTime;
  decided_at: IsoDateTime | null;
  decided_by: Uuid | null;
}

export interface TotpEnrolResult {
  factor_id: Uuid;
  otpauth_uri: string;
  secret: string;
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export type ResetSecurityWhat = 'passkeys' | 'totp' | 'all';

/** Error codes S1 screens handle (shared codes in CONTRACT.md §Errors). */
export type S1ErrorCode =
  | 'not_authenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'cohort_archived'
  | 'conflict'
  | 'rate_limited'
  | 'internal'
  | 'invalid_link'
  | 'invalid_code'
  | 'not_on_roster'
  | 'passkey_unsupported'
  | 'passkey_cancelled';

/** S1 methods (CONTRACT.md §S1 "Frontend Api methods"). */
export interface S1Api {
  lmsLanding(params: LmsLandingParams): Promise<Result<LmsLandingResult>>;
  sendEmailCode(email: string): Promise<Result<void>>;
  verifyEmailCode(email: string, code: string): Promise<Result<void>>;
  registerPasskey(): Promise<Result<void>>;
  signInWithPasskey(): Promise<Result<void>>;
  totpEnrol(): Promise<Result<TotpEnrolResult>>;
  totpVerify(code: string): Promise<Result<{ enrolled: true }>>;
  totpLogin(email: string, code: string): Promise<Result<void>>;
  signOut(): Promise<Result<void>>;
  getMe(): Promise<Result<Me>>;
  adminListCohorts(): Promise<Result<AdminCohort[]>>;
  adminUpsertCohort(input: UpsertCohortInput): Promise<Result<Cohort>>;
  adminUpdateCohortSettings(cohortId: Uuid, patch: Partial<CohortSettings>): Promise<Result<CohortSettings>>;
  listMembers(cohortId: Uuid, role?: EnrolmentRole): Promise<Result<Member[]>>;
  adminUpdateProfile(input: UpdateProfileInput): Promise<Result<Profile>>;
  adminSetEnrolmentStatus(enrolmentId: Uuid, status: EnrolmentStatus): Promise<Result<{ id: Uuid; status: EnrolmentStatus }>>;
  rosterImport(input: RosterImportInput): Promise<Result<RosterImportResult>>;
  adminListPending(cohortId: Uuid): Promise<Result<PendingRegistration[]>>;
  approvePending(pendingId: Uuid): Promise<Result<{ member: Member }>>;
  rejectPending(pendingId: Uuid): Promise<Result<PendingRegistration>>;
  adminResetSecurity(userId: Uuid, what: ResetSecurityWhat): Promise<Result<{ passkeys_removed: number; totp_removed: boolean }>>;
}

// ───────────────────────── S2 — Survey and grouping (CONTRACT.md §S2) ─────────────────────────

export type MacAccess = 'own' | 'shared' | 'none';
export type MacTier = 'A' | 'B' | 'C';
export type GroupingState = 'none' | 'draft' | 'locked';

export interface SurveyAnswers {
  mac_access: MacAccess;
  mac_model: string | null;
  /** macOS major (26, 15, 14, 13, 12 = older) or null = don't know. */
  macos_major: number | null;
  has_iphone: boolean;
  time_constraint: boolean;
  time_constraint_note: string | null;
  phone: string;
  whatsapp_opt_in: boolean;
}

export interface SurveyResponse extends SurveyAnswers {
  enrolment_id: Uuid;
  cohort_id: Uuid;
  mac_tier: MacTier;
  mac_tier_override: boolean;
  submitted_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface SurveyRow {
  enrolment_id: Uuid;
  user_id: Uuid;
  email: string;
  index_no: string | null;
  first_name: string;
  last_name: string;
  mac_tier: MacTier | null;
  mac_tier_override: boolean;
  group_no: number | null;
  response: SurveyResponse | null;
}

export interface TierChange {
  enrolment_id: Uuid;
  mac_tier: MacTier | null;
  mac_tier_override: boolean;
}

export interface GroupMember {
  enrolment_id: Uuid;
  first_name: string;
  last_name: string;
  index_no: string | null;
  mac_tier: MacTier | null;
  has_iphone: boolean | null;
  time_constraint: boolean | null;
  time_constraint_note: string | null;
  pinned_group: number | null;
}

export interface GroupSummary {
  no: number;
  name: string;
  size: number;
  tiers: { A: number; B: number; C: number; none: number };
  iphones: number;
  pinned: number;
  members: GroupMember[];
}

export interface Grouping {
  state: GroupingState;
  seed: number | null;
  group_count: number;
  updated_at: IsoDateTime | null;
  locked_at: IsoDateTime | null;
  groups: GroupSummary[];
  unassigned: GroupMember[];
  warnings: { not_surveyed: number; time_constraints_unpinned: number };
}

/** Error codes S2 screens handle (in addition to S1ErrorCode). */
export type S2ErrorCode = 'invalid_phone' | 'grouping_locked' | 'no_draft' | 'not_locked' | 'invalid_group';

/** S2 methods (CONTRACT.md §S2 "Frontend Api methods"). */
export interface S2Api {
  getMySurvey(cohortId: Uuid): Promise<Result<SurveyResponse | null>>;
  submitSurvey(cohortId: Uuid, answers: SurveyAnswers): Promise<Result<SurveyResponse>>;
  adminListSurvey(cohortId: Uuid): Promise<Result<SurveyRow[]>>;
  adminUpdateSurvey(enrolmentId: Uuid, answers: SurveyAnswers): Promise<Result<SurveyResponse>>;
  adminSetTier(enrolmentId: Uuid, tier: MacTier | null): Promise<Result<TierChange>>;
  getGrouping(cohortId: Uuid): Promise<Result<Grouping>>;
  groupingPreview(cohortId: Uuid, groupCount?: number | null, seed?: number | null): Promise<Result<Grouping>>;
  groupingPin(cohortId: Uuid, enrolmentId: Uuid, groupNo: number | null): Promise<Result<Grouping>>;
  groupingLock(cohortId: Uuid): Promise<Result<Grouping>>;
  groupingUnlock(cohortId: Uuid): Promise<Result<Grouping>>;
  adminSetGroup(enrolmentId: Uuid, groupNo: number | null): Promise<Result<Grouping>>;
}
