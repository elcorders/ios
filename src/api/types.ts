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
export type Api = CoreApi & S1Api & S2Api & S6Api & S7Api & S8Api & S9Api & S10Api & S3Api & S13Api & S14Api & S16Api;

// ───────────────────────── S1 — Auth, cohorts, roster (CONTRACT.md §S1) ─────────────────────────

export type Uuid = string;
export type CohortStatus = 'active' | 'archived';
export type EnrolmentRole = 'student' | 'instructor';
/** S7: `discarded` = hidden junk/test row, kept and restorable (PLAN D45). */
export type EnrolmentStatus = 'active' | 'removed' | 'discarded';
export type PendingStatus = 'pending' | 'approved' | 'rejected' | 'discarded';

export interface CohortSettings {
  whatsapp_link: string | null;
  /** S2: number of groups for auto-assignment (absent → 6). */
  group_count?: number;
  /** S8: students may send transfer requests (absent → false). */
  transfers_open?: boolean;
  /** S12: students of this cohort may use lab booking (absent → false). */
  lab_open?: boolean;
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
  group_no: number | null;
  group_name: string | null;
  /** S12: the cohort's lab booking switch (`settings.lab_open`). */
  lab_open: boolean;
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
  /** S7: student's group number (null for instructors / not grouped yet). */
  group_no: number | null;
  /** S8: survey answer (null for instructors / not answered). */
  has_mac: boolean | null;
  /** S9: earlier emails of this person, newest first (admin only; [] otherwise). */
  previous_emails: string[];
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
  /** S9: the row's index belongs to a member whose new email is another member's current email. */
  | 'email_conflict'
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
  /** S9: an existing person (matched by index) new to this cohort carries `email_change` when their email changes. */
  add: (RosterRow & { email_change?: [string, string] })[];
  /** S9: `changes.email = [old, new]` when the index matched and the email changed. */
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

/** submit_survey result: the stored answer and the auto-assigned group. */
export interface SurveySubmitResult {
  has_mac: boolean;
  submitted_at: IsoDateTime;
  group_no: number;
  group_name: string;
}

export interface SurveyOverviewRow {
  enrolment_id: Uuid;
  email: string;
  index_no: string | null;
  first_name: string;
  last_name: string;
  has_mac: boolean | null;
  submitted_at: IsoDateTime | null;
  group_no: number | null;
}

export interface SurveyOverview {
  counts: { students: number; answered: number; has_mac: number; no_mac: number };
  groups: { no: number; name: string; size: number; has_mac: number; no_mac: number }[];
  rows: SurveyOverviewRow[];
}

/** S2 methods (CONTRACT.md §S2 "Frontend Api methods"). */
export interface S2Api {
  submitSurvey(cohortId: Uuid, hasMac: boolean): Promise<Result<SurveySubmitResult>>;
  adminListSurvey(cohortId: Uuid): Promise<Result<SurveyOverview>>;
}

// ───────────────────────── S6 — Content: resources + tutorials (CONTRACT.md §S6) ─────────────────────────

export type ContentKind = 'resource' | 'tutorial' | 'material';
/** `on_session`: released per group by linked class sessions, not visible to everyone yet (§S14). */
export type ContentStatus = 'draft' | 'scheduled' | 'published' | 'on_session';

/** list_content row (visible items only, no body). */
export interface ContentSummary {
  id: Uuid;
  kind: ContentKind;
  cohort_id: Uuid | null;
  cohort_code: string | null;
  title: string;
  summary: string | null;
  position: number;
  published_at: IsoDateTime;
}

/** get_content result. Render body_html only in the sandboxed viewer (CONTRACT §S6 Viewer). */
export interface ContentItem {
  id: Uuid;
  kind: ContentKind;
  cohort_code: string | null;
  title: string;
  summary: string | null;
  published_at: IsoDateTime;
  body_html: string;
}

export interface AdminContentRow {
  id: Uuid;
  kind: ContentKind;
  cohort_id: Uuid | null;
  title: string;
  summary: string | null;
  position: number;
  published_at: IsoDateTime | null;
  status: ContentStatus;
  size_bytes: number;
  updated_at: IsoDateTime;
  /** §S14: number of class sessions linking this item. */
  linked_sessions: number;
  /** §S14: earliest linked session start still in the future, else null. */
  release_at: IsoDateTime | null;
}

export interface AdminContentItem extends Omit<ContentItem, 'published_at'> {
  cohort_id: Uuid | null;
  position: number;
  published_at: IsoDateTime | null;
  status: ContentStatus;
}

export interface UpsertContentInput {
  /** null = create. */
  id: Uuid | null;
  kind: ContentKind;
  /** Required for tutorials, null for resources. */
  cohort_id: Uuid | null;
  title: string;
  summary: string | null;
  position: number;
  /** null on update = keep the stored body. Required on create. */
  body_html: string | null;
}

/** S6 methods (CONTRACT.md §S6 "Frontend Api methods"). */
export interface S6Api {
  listContent(kind: ContentKind): Promise<Result<ContentSummary[]>>;
  getContent(id: Uuid): Promise<Result<ContentItem>>;
  adminListContent(kind: ContentKind, cohortId: Uuid | null): Promise<Result<AdminContentRow[]>>;
  adminGetContent(id: Uuid): Promise<Result<AdminContentItem>>;
  adminUpsertContent(input: UpsertContentInput): Promise<Result<AdminContentRow>>;
  /** null = unpublish; <= now = publish now; future = schedule. */
  adminSetContentPublish(id: Uuid, publishedAt: IsoDateTime | null): Promise<Result<AdminContentRow>>;
  adminDeleteContent(id: Uuid): Promise<Result<{ ok: true }>>;
  adminCopyTutorials(fromCohortId: Uuid, toCohortId: Uuid): Promise<Result<{ copied: number }>>;
}

// ───────────────────────── S7 — Admin: discard, tables, groups view (CONTRACT.md §S7) ─────────────────────────

/** S7 methods. Groups view reuses adminListSurvey (S2). */
export interface S7Api {
  /** 'discarded' from pending/rejected; 'pending' restores a discarded row. */
  adminSetPendingStatus(pendingId: Uuid, status: 'discarded' | 'pending'): Promise<Result<PendingRegistration>>;
}

// ───────────────────────── S8 — Group transfers + transfer emails (CONTRACT.md §S8) ─────────────────────────

export type TransferStatus = 'open' | 'approved' | 'rejected' | 'cancelled';

/** Group sizes (same shape as SurveyOverview.groups). size counts active students; has_mac/no_mac from the survey. */
export interface GroupStat {
  no: number;
  name: string;
  size: number;
  has_mac: number;
  no_mac: number;
}

export interface TransferRequest {
  id: Uuid;
  cohort_id: Uuid;
  from_no: number;
  pref1_no: number;
  pref2_no: number;
  reason: string;
  status: TransferStatus;
  decided_no: number | null;
  admin_note: string | null;
  closed_by: 'student' | 'admin' | null;
  created_at: IsoDateTime;
  decided_at: IsoDateTime | null;
}

export interface MyTransfers {
  transfers_open: boolean;
  group_no: number | null;
  groups: { no: number; name: string }[];
  /** Own requests, newest first. */
  requests: TransferRequest[];
}

export interface RequestTransferInput {
  cohortId: Uuid;
  pref1No: number;
  pref2No: number;
  reason: string;
}

export interface AdminTransferRow extends TransferRequest {
  enrolment_id: Uuid;
  enrolment_status: EnrolmentStatus;
  email: string;
  index_no: string | null;
  first_name: string;
  last_name: string;
  has_mac: boolean | null;
  current_no: number | null;
  decided_by_email: string | null;
}

export interface AdminTransfers {
  transfers_open: boolean;
  groups: GroupStat[];
  /** All statuses, oldest first. */
  requests: AdminTransferRow[];
  outbox: { queued: number; failed: number };
}

export interface DecideTransferInput {
  requestId: Uuid;
  approve: boolean;
  /** Required when approving. */
  groupNo: number | null;
  note: string | null;
}

export interface TransferDecision {
  requests: AdminTransferRow[];
  groups: GroupStat[];
}

export interface MoveStudentInput {
  enrolmentId: Uuid;
  groupNo: number;
  note: string | null;
}

export interface MoveResult extends TransferDecision {
  from_no: number | null;
  to_no: number;
}

export interface OutboxSendResult {
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
}

/** S8 methods (CONTRACT.md §S8 "Frontend Api methods"). */
export interface S8Api {
  getMyTransfers(cohortId: Uuid): Promise<Result<MyTransfers>>;
  requestTransfer(input: RequestTransferInput): Promise<Result<TransferRequest>>;
  cancelTransfer(requestId: Uuid): Promise<Result<TransferRequest>>;
  adminListTransfers(cohortId: Uuid): Promise<Result<AdminTransfers>>;
  adminDecideTransfer(input: DecideTransferInput): Promise<Result<TransferDecision>>;
  adminApproveSwap(requestA: Uuid, requestB: Uuid, note?: string | null): Promise<Result<TransferDecision>>;
  adminMoveStudent(input: MoveStudentInput): Promise<Result<MoveResult>>;
  adminSendOutbox(retryFailed?: boolean): Promise<Result<OutboxSendResult>>;
}

// ───────────────────────── S9 — Email changes (CONTRACT.md §S9) ─────────────────────────

export interface EmailChangeResult {
  user_id: Uuid;
  email: string;
  /** Newest first. */
  previous_emails: string[];
}

/** S9 methods. */
export interface S9Api {
  adminChangeEmail(userId: Uuid, email: string): Promise<Result<EmailChangeResult>>;
}

// ───────────────────────── S10 — Survey reset (CONTRACT.md §S10) ─────────────────────────

/** S10 methods. Admin only; the student keeps their group and answers again. */
export interface S10Api {
  adminResetSurvey(cohortId: Uuid, enrolmentIds: Uuid[]): Promise<Result<{ reset: number }>>;
}

// ───────────────────────── S3 — Lab calendar, booking, credits (CONTRACT.md §S3) ─────────────────────────

export type MacStatus = 'in_service' | 'out_of_service';
export type ClosureKind = 'holiday' | 'closed' | 'class_day';
export type BookingStatus = 'booked' | 'withdrawn' | 'checked_in' | 'completed' | 'no_show';
/** `YYYY-MM-DD`, Colombo calendar day. */
export type IsoDate = string;

export interface Mac {
  id: Uuid;
  no: number;
  label: string | null;
  status: MacStatus;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface MacInput {
  id: Uuid | null;
  no: number;
  label: string | null;
  status: MacStatus;
  notes: string | null;
}

/** ISO weekday 1 = Mon … 7 = Sun; times "HH:00". A missing weekday = closed. */
export interface LabHours {
  weekday: number;
  open_time: string;
  close_time: string;
}

export interface Closure {
  id: Uuid;
  date: IsoDate;
  kind: ClosureKind;
  reason: string | null;
  /** §S13: rows added by one range share this id. */
  range_id: Uuid | null;
  created_by: Uuid | null;
  created_at: IsoDateTime;
}

export interface ClosureInput {
  date: IsoDate;
  kind: ClosureKind;
  reason: string | null;
}

/** §S13: quiet < 50 %, filling < 80 %, almost_full < 100 %, full. */
export type FullnessLevel = 'quiet' | 'filling' | 'almost_full' | 'full';

export interface LabSlot {
  start: IsoDateTime;
  end: IsoDateTime;
  /** Number for staff (admin / instructor), null for students. */
  booked: number | null;
  full: boolean;
  /** §S13: before the day's class-session block (can't be booked). */
  blocked: boolean;
  /** null when blocked. */
  level: FullnessLevel | null;
}

export interface LabDay {
  date: IsoDate;
  weekday: number;
  open: boolean;
  closure: { kind: ClosureKind; reason: string | null } | null;
  /** §S13: class sessions block the lab until this time ("HH:MM", "24:00" = whole day), else null. */
  block_until: string | null;
  /** null when closed or every slot is blocked. */
  level: FullnessLevel | null;
  /** Staff only (null for students): bookings / capacity over unblocked slots. */
  booked: number | null;
  slot_capacity: number | null;
  slots: LabSlot[];
}

export interface LabCalendar {
  /** Staff only; null for students. */
  capacity: number | null;
  days: LabDay[];
}

export interface Booking {
  id: Uuid;
  slot_start: IsoDateTime;
  slot_end: IsoDateTime;
  status: BookingStatus;
  preferred_mac_no: number | null;
  created_at: IsoDateTime;
}

export type LabIneligibleReason = 'has_mac' | 'no_survey' | 'suspended' | 'not_student' | 'lab_closed';

export interface MyLab {
  eligible: boolean;
  reason: LabIneligibleReason | null;
  cycle: { no: number; start: IsoDate; end: IsoDate };
  credits: { allowance: number; used: number; remaining: number; /** credits taken off for no-shows since the last attended booking (D53) */ penalty: number };
  week: { start: IsoDate; end: IsoDate; hours: number; cap: number };
  no_shows: number;
  suspended: boolean;
  preferred_mac_id: Uuid | null;
  preferred_mac_no: number | null;
  needs_preferred_mac: boolean;
  horizon_end: IsoDate;
  /** In-service Macs (for the preferred-Mac prompt). */
  macs: { id: Uuid; no: number; label: string | null }[];
  bookings: Booking[];
}

export interface BookWarning {
  slot_start: IsoDateTime;
  code: 'preferred_mac_overlap';
  suggestions: IsoDateTime[];
}

export interface BookResult {
  bookings: Booking[];
  warnings: BookWarning[];
}

export interface LabBookingRow {
  id: Uuid;
  slot_start: IsoDateTime;
  status: BookingStatus;
  cohort_code: string;
  enrolment_id: Uuid;
  email: string;
  index_no: string | null;
  first_name: string;
  last_name: string;
  group_no: number | null;
  preferred_mac_no: number | null;
}

export interface LabCreditRow {
  enrolment_id: Uuid;
  email: string;
  index_no: string | null;
  first_name: string;
  last_name: string;
  group_no: number | null;
  eligible: boolean;
  allowance: number;
  used: number;
  remaining: number;
  no_shows: number;
  suspended: boolean;
  upcoming: number;
}

/** S3 methods (CONTRACT.md §S3 "Frontend Api methods"). */
export interface S3Api {
  getLabCalendar(from: IsoDate, to: IsoDate): Promise<Result<LabCalendar>>;
  getMyLab(cohortId: Uuid): Promise<Result<MyLab>>;
  bookSlots(cohortId: Uuid, slotStarts: IsoDateTime[]): Promise<Result<BookResult>>;
  withdrawBooking(bookingId: Uuid): Promise<Result<Booking>>;
  setPreferredMac(cohortId: Uuid, macId: Uuid | null): Promise<Result<{ preferred_mac_id: Uuid | null; preferred_mac_no: number | null }>>;
  adminListMacs(): Promise<Result<Mac[]>>;
  adminUpsertMac(mac: MacInput): Promise<Result<Mac>>;
  getLabHours(): Promise<Result<LabHours[]>>;
  adminSetLabHours(hours: LabHours[]): Promise<Result<LabHours[]>>;
  listClosures(from: IsoDate, to: IsoDate): Promise<Result<Closure[]>>;
  adminAddClosures(items: ClosureInput[]): Promise<Result<{ added: number; updated: number }>>;
  adminDeleteClosure(id: Uuid, wholeRange?: boolean): Promise<Result<{ ok: true; deleted: number }>>;
  adminListLabBookings(from: IsoDate, to: IsoDate): Promise<Result<LabBookingRow[]>>;
  adminLabCredits(cohortId: Uuid): Promise<Result<LabCreditRow[]>>;
  adminAdjustCredits(enrolmentId: Uuid, amount: number, reason: string): Promise<Result<{ allowance: number; used: number; remaining: number }>>;
  adminClearSuspension(enrolmentId: Uuid): Promise<Result<{ suspended: false }>>;
}

// ───────────────────────── S13 — Lab calendars, closure ranges (CONTRACT.md §S13) ─────────────────────────

export interface ClosureRangeInput {
  from: IsoDate;
  to: IsoDate;
  kind: ClosureKind;
  reason: string | null;
}

export interface S13Api {
  adminAddClosureRange(input: ClosureRangeInput): Promise<Result<{ added: number; updated: number; range_id: Uuid }>>;
}

// ───────────────────────── S14 — Class materials + class sessions (CONTRACT.md §S14) ─────────────────────────

export interface ClassSession {
  id: Uuid;
  cohort_id: Uuid;
  date: IsoDate;
  /** "HH:MM" Colombo. */
  start_time: string;
  end_time: string;
  starts_at: IsoDateTime;
  ends_at: IsoDateTime;
  title: string;
  group_nos: number[];
  deliverables: string[];
  /** "HH:MM", "24:00" (whole day) or null (doesn't block the lab). */
  lab_block_until: string | null;
  content: { id: Uuid; kind: ContentKind; title: string; status: ContentStatus }[];
}

export interface ClassSessionInput {
  id: Uuid | null;
  cohort_id: Uuid;
  date: IsoDate;
  start_time: string;
  end_time: string;
  title: string;
  group_nos: number[];
  deliverables: string[];
  lab_block_until: string | null;
  content_ids: Uuid[];
}

export interface MySession {
  id: Uuid;
  date: IsoDate;
  start_time: string;
  end_time: string;
  starts_at: IsoDateTime;
  ends_at: IsoDateTime;
  title: string;
  group_nos: number[];
  deliverables: string[];
  /** `available` = visible to the caller now (only then link to /c/:id). */
  content: { id: Uuid; kind: ContentKind; title: string; available: boolean }[];
}

export interface MySessions {
  next: MySession | null;
  upcoming: MySession[];
  recent: MySession[];
}

export interface S14Api {
  adminListClassSessions(cohortId: Uuid): Promise<Result<ClassSession[]>>;
  adminUpsertClassSession(input: ClassSessionInput): Promise<Result<ClassSession>>;
  adminDeleteClassSession(id: Uuid): Promise<Result<{ ok: true }>>;
  getMySessions(cohortId: Uuid): Promise<Result<MySessions>>;
}

// ───────────────────────── S16 — Web push (CONTRACT.md §S16) ─────────────────────────

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
}

export interface PushStats {
  users: number;
  devices: number;
  students: number;
  students_with_push: number;
  queued: number;
}

export interface S16Api {
  savePushSubscription(sub: PushSubscriptionInput): Promise<Result<{ id: Uuid }>>;
  deletePushSubscription(endpoint: string): Promise<Result<{ ok: true }>>;
  getMyPush(): Promise<Result<{ devices: number }>>;
  adminPushStats(): Promise<Result<PushStats>>;
  adminPushTest(): Promise<Result<{ queued: number }>>;
  adminPushSend(): Promise<Result<{ sent: number; failed: number; skipped: number; remaining: number }>>;
}
