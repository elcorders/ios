import type {
  ApiError, BookWarning, Booking, BookingStatus, Closure, ClosureKind, IsoDate, IsoDateTime, LabBookingRow, LabCalendar,
  FullnessLevel, LabCreditRow, LabDay, LabHours, LabSlot, Mac, MyLab, Result, S13Api, S3Api,
} from '../types';
import { getMockCurrentEmail } from './auth';
import { getMockLabOpen } from './cohortState';
import { MOCK_ARCHIVED_COHORT, MOCK_COHORT, MOCK_USERS, type MockUser } from './fixtures/s1';
import { mockActiveStudents, mockGroupOf } from './survey';
import { labBlockUntil } from './sessionStore';
import { mockEnqueueNotification, setClosureImpactHook } from './push';

/** S3 mock (CONTRACT.md §S3). In-memory, fictional data. All calendar logic is Asia/Colombo (+05:30, no DST). */

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string, details?: unknown): Result<T> => ({
  ok: false,
  error: { code, message: code, ...(details === undefined ? {} : { details }) } satisfies ApiError,
});

// Settings defaults (CONTRACT §S3 "Settings").
const CREDITS_PER_CYCLE = 20;
const WEEKLY_CAP = 10;
const CYCLE_START: IsoDate = '2026-11-07';
const CYCLE_DAYS = 14;
const NO_SHOW_PENALTY = 2;
const SUSPEND_AFTER = 3;
const HORIZON_DAYS = 14;
const MAX_BOOK = 13;
const PENALTY_CAP_PCT = 75;

// ───────────── time helpers ─────────────
const OFFSET_MS = 5.5 * 3600_000;
const HOUR_MS = 3600_000;
const DAY_MS = 86_400_000;

const shifted = (ms: number) => new Date(ms + OFFSET_MS);
const toIso = (ms: number): IsoDateTime => `${shifted(ms).toISOString().slice(0, 19)}+05:30`;
const dateOf = (ms: number): IsoDate => shifted(ms).toISOString().slice(0, 10);
const dateMs = (d: IsoDate) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d: IsoDate, n: number): IsoDate => new Date(dateMs(d) + n * DAY_MS).toISOString().slice(0, 10);
const diffDays = (a: IsoDate, b: IsoDate) => Math.round((dateMs(b) - dateMs(a)) / DAY_MS);
const weekdayOf = (d: IsoDate) => new Date(dateMs(d)).getUTCDay() || 7;
const slotMs = (d: IsoDate, hour: number) => dateMs(d) - OFFSET_MS + hour * HOUR_MS;
const validDate = (d: unknown): d is IsoDate =>
  typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(dateMs(d)) && new Date(dateMs(d)).toISOString().slice(0, 10) === d;
const wholeHour = (ms: number) => Number.isFinite(ms) && (ms + OFFSET_MS) % HOUR_MS === 0;
const nowMs = () => Date.now();
const today = () => dateOf(nowMs());

const cycleNoOf = (d: IsoDate) => Math.floor(diffDays(CYCLE_START, d) / CYCLE_DAYS) + 1;
const cycleStartOf = (k: number) => addDays(CYCLE_START, (k - 1) * CYCLE_DAYS);
const cycleEndOf = (k: number) => addDays(cycleStartOf(k), CYCLE_DAYS - 1);
const weekStartOf = (d: IsoDate) => addDays(CYCLE_START, Math.floor(diffDays(CYCLE_START, d) / 7) * 7);

// ───────────── state ─────────────
interface MockBooking {
  id: string;
  enrolment_id: string;
  cohort_id: string;
  slot_ms: number;
  status: BookingStatus;
  preferred_mac_id: string | null;
  created_at: IsoDateTime;
  withdrawn_at: IsoDateTime | null;
}
interface Adjustment { enrolment_id: string; cycle_no: number; amount: number; reason: string }

let macs: Mac[] = [];
let hours: LabHours[] = [];
let closures: Closure[] = [];
let bookings: MockBooking[] = [];
let adjustments: Adjustment[] = [];
let prefs = new Map<string, string>();
let cleared = new Map<string, number>(); // enrolment -> suspension_cleared_at (ms)
let seq = 0;

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const newId = (prefix: string) => `00000000-0000-4000-8000-${prefix}${pad(++seq, 12 - prefix.length)}`;
const studentEmail = (n: number) => `student${pad(n, 3)}@example.edu`;
const userEnrol = (u: MockUser) => `enrol-${u.profile.id}`;

/** Fictional other students that hold seats (not real enrolments). */
const FILLER_FIRST = 81;
const fillerEnrol = (i: number) => `filler-${pad(i, 2)}`;
const fillerProfile = (enrolmentId: string) => {
  const n = FILLER_FIRST + Number(enrolmentId.slice(-2)) - 1;
  return { email: studentEmail(n), index_no: `COBSCCOMP251P-${pad(n, 3)}`, first_name: `Test${pad(n, 3)}`, last_name: 'Student' };
};

const hoursFor = (weekday: number) => hours.find((h) => h.weekday === weekday);
const KIND_PRIORITY: ClosureKind[] = ['holiday', 'closed', 'class_day'];
const closureOn = (d: IsoDate) =>
  closures.filter((c) => c.date === d).sort((a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind))[0];
const closesLab = (d: IsoDate) => closures.some((c) => c.date === d);
const isOpenDay = (d: IsoDate) => !!hoursFor(weekdayOf(d)) && !closesLab(d);
const hourNum = (t: string) => Number(t.slice(0, 2));
const slotHours = (d: IsoDate): number[] => {
  const h = hoursFor(weekdayOf(d));
  if (!h || closesLab(d)) return [];
  return Array.from({ length: hourNum(h.close_time) - hourNum(h.open_time) }, (_, i) => hourNum(h.open_time) + i);
};
const capacity = () => macs.filter((m) => m.status === 'in_service').length;
const counted = (b: MockBooking) => b.status !== 'withdrawn';
const seatsTaken = (ms: number) => bookings.filter((b) => counted(b) && b.slot_ms === ms).length;
/** §S13 lab_level: one helper for every fullness label. */
export function labLevel(booked: number, cap: number): FullnessLevel {
  if (cap <= 0 || booked >= cap) return 'full';
  const r = booked / cap;
  return r < 0.5 ? 'quiet' : r < 0.8 ? 'filling' : 'almost_full';
}
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const isStaff = (u: MockUser) => u.profile.is_admin || u.role === 'instructor';
const slotBlocked = (blockUntil: string | null, hour: number) => blockUntil !== null && hour * 60 < minutesOf(blockUntil);
const macNo = (id: string | null) => (id ? (macs.find((m) => m.id === id)?.no ?? null) : null);

function toBooking(b: MockBooking): Booking {
  return {
    id: b.id,
    slot_start: toIso(b.slot_ms),
    slot_end: toIso(b.slot_ms + HOUR_MS),
    status: b.status,
    preferred_mac_no: macNo(b.preferred_mac_id),
    created_at: b.created_at,
  };
}

function seed(): void {
  seq = 0;
  const stamp = toIso(nowMs());
  macs = Array.from({ length: 13 }, (_, i) => ({
    id: newId('000000003'),
    no: i + 1,
    label: null,
    status: i === 12 ? 'out_of_service' : 'in_service',
    notes: i === 12 ? 'Fictional: screen being repaired.' : null,
    created_at: stamp,
    updated_at: stamp,
  }));
  hours = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open_time: '09:00', close_time: '19:00' }));
  const t = today();
  closures = [
    { id: newId('000000005'), date: addDays(t, 3), kind: 'class_day', reason: 'Class day (fictional)', range_id: null, created_by: null, created_at: stamp },
    { id: newId('000000005'), date: addDays(t, 5), kind: 'holiday', reason: 'Public holiday (fictional)', range_id: null, created_by: null, created_at: stamp },
  ];
  bookings = [];
  adjustments = [];
  prefs = new Map();
  cleared = new Map();

  const nextOpen = (after: IsoDate) => {
    let d = addDays(after, 1);
    while (!isOpenDay(d)) d = addDays(d, 1);
    return d;
  };
  const d1 = nextOpen(t);
  const d2 = nextOpen(d1);
  const put = (enrolment_id: string, d: IsoDate, hour: number, pref: number | null = null) =>
    bookings.push({
      id: newId('000000004'), enrolment_id, cohort_id: MOCK_COHORT.id, slot_ms: slotMs(d, hour), status: 'booked',
      preferred_mac_id: pref ? (macs.find((m) => m.no === pref)?.id ?? null) : null, created_at: stamp, withdrawn_at: null,
    });
  for (let i = 1; i <= 12; i++) put(fillerEnrol(i), d1, 10); // full: 12 in-service Macs
  put(fillerEnrol(1), d1, 11, 3); // someone prefers Mac 3 here
  for (let i = 1; i <= 5; i++) put(fillerEnrol(i), d1, 14);
  for (let i = 1; i <= 3; i++) put(fillerEnrol(i), d2, 9);
  // student001 has a Mac now but kept an earlier booking (withdraw still allowed).
  const s1 = MOCK_USERS.find((u) => u.profile.email === studentEmail(1))!;
  put(userEnrol(s1), d2, 16);
}
seed();

/** Test helper: restore the seeded lab data (relative to the current date). */
export function resetMockLab(): void {
  seed();
}

// ───────────── access helpers ─────────────
const currentUser = (): MockUser | undefined => {
  const email = getMockCurrentEmail();
  return email ? MOCK_USERS.find((u) => u.profile.email === email) : undefined;
};
const canRead = (u: MockUser) => u.profile.is_admin || u.role !== null;
const isInstructor = (u: MockUser) => u.role === 'instructor';
const studentEnrolment = (cohortId: string, u: MockUser) =>
  [...mockActiveStudents(cohortId)].find((e) => e.user_id === u.profile.id);
const findStudentEnrolmentById = (id: string) =>
  [...mockActiveStudents(MOCK_COHORT.id), ...mockActiveStudents(MOCK_ARCHIVED_COHORT.id)].find((e) => e.id === id);

// ───────────── credits ─────────────
const streakNoShows = (enrolmentId: string): MockBooking[] => {
  const own = bookings.filter((b) => b.enrolment_id === enrolmentId);
  const attended = own.filter((b) => b.status === 'checked_in' || b.status === 'completed').map((b) => b.slot_ms);
  const last = attended.length ? Math.max(...attended) : -Infinity;
  return own.filter((b) => b.status === 'no_show' && b.slot_ms > last);
};
const noShows = (enrolmentId: string) => streakNoShows(enrolmentId).length;
const penaltyOf = (enrolmentId: string) =>
  Math.min(NO_SHOW_PENALTY * noShows(enrolmentId), Math.floor((CREDITS_PER_CYCLE * PENALTY_CAP_PCT) / 100));
const allowanceOf = (enrolmentId: string, k: number) =>
  CREDITS_PER_CYCLE - penaltyOf(enrolmentId) +
  adjustments.filter((a) => a.enrolment_id === enrolmentId && a.cycle_no === k).reduce((s, a) => s + a.amount, 0);
const usedOf = (enrolmentId: string, k: number) =>
  bookings.filter((b) => b.enrolment_id === enrolmentId && counted(b) && cycleNoOf(dateOf(b.slot_ms)) === k).length;
const creditsOf = (enrolmentId: string, k: number) => {
  const allowance = allowanceOf(enrolmentId, k);
  const used = usedOf(enrolmentId, k);
  return { allowance, used, remaining: allowance - used, penalty: penaltyOf(enrolmentId) };
};
const weekHours = (enrolmentId: string, weekStart: IsoDate) =>
  bookings.filter((b) => b.enrolment_id === enrolmentId && counted(b) && weekStartOf(dateOf(b.slot_ms)) === weekStart).length;
const isSuspended = (enrolmentId: string) => {
  const after = cleared.get(enrolmentId) ?? -Infinity;
  return streakNoShows(enrolmentId).filter((b) => b.slot_ms > after).length >= SUSPEND_AFTER;
};

const labOpenFor = (cohortId: string) => getMockLabOpen(cohortId, cohortId === MOCK_COHORT.id);
const cohortOfEnrolment = (enrolmentId: string) => findStudentEnrolmentById(enrolmentId)?.cohort_id ?? MOCK_COHORT.id;

function ineligibleReason(enrolmentId: string): MyLab['reason'] {
  if (!labOpenFor(cohortOfEnrolment(enrolmentId))) return 'lab_closed';
  const a = mockGroupOf(enrolmentId).has_mac;
  if (a === null) return 'no_survey';
  if (a) return 'has_mac';
  return isSuspended(enrolmentId) ? 'suspended' : null;
}

function buildMyLab(enrolmentId: string): MyLab {
  const t = today();
  const k = cycleNoOf(t);
  const reason = ineligibleReason(enrolmentId);
  const own = bookings.filter((b) => b.enrolment_id === enrolmentId && counted(b));
  const prefId = prefs.get(enrolmentId) ?? null;
  const ws = weekStartOf(t);
  return {
    eligible: reason === null,
    reason,
    cycle: { no: k, start: cycleStartOf(k), end: cycleEndOf(k) },
    credits: creditsOf(enrolmentId, k),
    week: { start: ws, end: addDays(ws, 6), hours: weekHours(enrolmentId, ws), cap: WEEKLY_CAP },
    no_shows: noShows(enrolmentId),
    suspended: isSuspended(enrolmentId),
    preferred_mac_id: prefId,
    preferred_mac_no: macNo(prefId),
    needs_preferred_mac: own.length >= 1 && !prefId,
    horizon_end: addDays(t, HORIZON_DAYS),
    macs: macs.filter((m) => m.status === 'in_service').map((m) => ({ id: m.id, no: m.no, label: m.label })),
    bookings: own
      .filter((b) => dateOf(b.slot_ms) >= cycleStartOf(k))
      .sort((x, y) => x.slot_ms - y.slot_ms)
      .map(toBooking),
  };
}

function suggestionsFor(slotMsValue: number, prefId: string, enrolmentId: string): IsoDateTime[] {
  const d = dateOf(slotMsValue);
  const out: IsoDateTime[] = [];
  for (const h of slotHours(d)) {
    const ms = slotMs(d, h);
    if (ms === slotMsValue || ms <= nowMs() || seatsTaken(ms) >= capacity()) continue;
    const here = bookings.filter((b) => counted(b) && b.slot_ms === ms);
    if (here.some((b) => b.preferred_mac_id === prefId || b.enrolment_id === enrolmentId)) continue;
    out.push(toIso(ms));
    if (out.length === 5) break;
  }
  return out;
}


// ───────────── closures: withdraw future bookings (S19) ─────────────
const futureBookedOn = (d: IsoDate) => bookings.filter((b) => b.status === 'booked' && b.slot_ms > nowMs() && dateOf(b.slot_ms) === d);
const hhmm = (ms: number) => shifted(ms).toISOString().slice(11, 16);
const dayLabel = (d: IsoDate) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(dateMs(d))).replace(',', '');

function closureImpact(from: IsoDate, to: IsoDate): { bookings: number; students: number } {
  const hit: MockBooking[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) hit.push(...futureBookedOn(d));
  return { bookings: hit.length, students: new Set(hit.map((b) => b.enrolment_id)).size };
}
setClosureImpactHook(closureImpact);

/** Withdraw future booked bookings on a closed date and tell each student once. Returns the count. */
function withdrawForClosure(d: IsoDate, reason: string | null): number {
  const hit = futureBookedOn(d);
  const byStudent = new Map<string, MockBooking[]>();
  for (const b of hit) {
    b.status = 'withdrawn';
    b.withdrawn_at = toIso(nowMs());
    byStudent.set(b.enrolment_id, [...(byStudent.get(b.enrolment_id) ?? []), b]);
  }
  for (const [enrolmentId, list] of byStudent) {
    const e = findStudentEnrolmentById(enrolmentId);
    if (!e) continue; // fictional filler students have no account
    const times = list.sort((x, y) => x.slot_ms - y.slot_ms).map((b) => `${hhmm(b.slot_ms)}–${hhmm(b.slot_ms + HOUR_MS)}`).join(', ');
    mockEnqueueNotification(e.user_id, 'lab_closed', `Lab closed ${dayLabel(d)}`, `${reason ?? 'The lab is closed'}. Your booking ${times} was cancelled and your credits returned.`, '/#/lab');
  }
  return hit.length;
}

// ───────────── API ─────────────
const rangeOk = (from: unknown, to: unknown) => validDate(from) && validDate(to) && diffDays(from, to) >= 0 && diffDays(from, to) <= 31;

export const mockLab: S3Api & S13Api = {
  async getLabCalendar(from, to) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!canRead(u)) return fail('forbidden');
    if (!rangeOk(from, to)) return fail('invalid_input');
    const staff = isStaff(u);
    const cap = capacity();
    const days: LabDay[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const c = closureOn(d);
      const blockUntil = labBlockUntil(d);
      let sumBooked = 0;
      let unblocked = 0;
      const slots: LabSlot[] = slotHours(d).map((h) => {
        const ms = slotMs(d, h);
        const booked = seatsTaken(ms);
        const blocked = slotBlocked(blockUntil, h);
        if (!blocked) {
          sumBooked += booked;
          unblocked += 1;
        }
        return {
          start: toIso(ms),
          end: toIso(ms + HOUR_MS),
          blocked,
          full: !blocked && booked >= cap,
          level: blocked ? null : labLevel(booked, cap),
          booked: staff ? booked : null,
        };
      });
      const sumCap = unblocked * cap;
      days.push({
        date: d,
        weekday: weekdayOf(d),
        open: isOpenDay(d),
        closure: c ? { kind: c.kind, reason: c.reason } : null,
        block_until: blockUntil,
        level: unblocked ? labLevel(sumBooked, sumCap) : null,
        booked: staff ? sumBooked : null,
        slot_capacity: staff ? sumCap : null,
        slots,
      });
    }
    const out: LabCalendar = { capacity: staff ? cap : null, days };
    return ok(out);
  },

  async getMyLab(cohortId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    const e = studentEnrolment(cohortId, u);
    if (!e) return fail('forbidden');
    return ok(buildMyLab(e.id));
  },

  async bookSlots(cohortId, slotStarts) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    const e = studentEnrolment(cohortId, u);
    if (!e) return fail('forbidden');
    if (cohortId === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    const list = Array.isArray(slotStarts) ? slotStarts : [];
    const times = list.map((s) => Date.parse(s));
    if (list.length < 1 || list.length > MAX_BOOK || times.some((t) => !wholeHour(t)) || new Set(times).size !== times.length) {
      return fail('invalid_input');
    }
    const reason = ineligibleReason(e.id);
    if (reason === 'lab_closed') return fail('lab_closed');
    if (reason === 'suspended') return fail('suspended');
    if (reason) return fail('not_eligible');

    const t = today();
    const sorted = [...times].sort((a, b) => a - b);
    const tally = new Map<number, number>();
    const weekTally = new Map<string, number>();
    for (const ms of sorted) {
      const hint = { slot_start: toIso(ms) };
      const d = dateOf(ms);
      if (ms <= nowMs()) return fail('slot_past', hint);
      if (d > addDays(t, HORIZON_DAYS)) return fail('beyond_horizon', hint);
      const hr = Number(shifted(ms).toISOString().slice(11, 13));
      if (!slotHours(d).includes(hr) || slotBlocked(labBlockUntil(d), hr)) return fail('slot_closed', hint);
      if (bookings.some((b) => b.enrolment_id === e.id && counted(b) && b.slot_ms === ms)) return fail('already_booked', hint);
      if (seatsTaken(ms) >= capacity()) return fail('slot_full', hint);
      const k = cycleNoOf(d);
      const nextK = (tally.get(k) ?? 0) + 1;
      if (usedOf(e.id, k) + nextK > allowanceOf(e.id, k)) return fail('no_credits', hint);
      tally.set(k, nextK);
      const ws = weekStartOf(d);
      const nextW = (weekTally.get(ws) ?? 0) + 1;
      if (weekHours(e.id, ws) + nextW > WEEKLY_CAP) return fail('weekly_cap', hint);
      weekTally.set(ws, nextW);
    }

    const prefId = prefs.get(e.id) ?? null;
    const stamp = toIso(nowMs());
    const warnings: BookWarning[] = [];
    const created = sorted.map((ms) => {
      const overlap = prefId !== null && bookings.some((b) => counted(b) && b.slot_ms === ms && b.preferred_mac_id === prefId);
      const row: MockBooking = {
        id: newId('000000004'), enrolment_id: e.id, cohort_id: cohortId, slot_ms: ms, status: 'booked',
        preferred_mac_id: prefId, created_at: stamp, withdrawn_at: null,
      };
      if (overlap) warnings.push({ slot_start: toIso(ms), code: 'preferred_mac_overlap', suggestions: suggestionsFor(ms, prefId, e.id) });
      return row;
    });
    bookings.push(...created);
    return ok({ bookings: created.map(toBooking), warnings });
  },

  async withdrawBooking(bookingId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    const b = bookings.find((x) => x.id === bookingId);
    const own = b && studentEnrolment(b.cohort_id, u)?.id === b.enrolment_id;
    if (!b || !own) return fail('not_found');
    if (b.status !== 'booked') return fail('conflict');
    if (b.slot_ms <= nowMs()) return fail('too_late');
    b.status = 'withdrawn';
    b.withdrawn_at = toIso(nowMs());
    return ok(toBooking(b));
  },

  async setPreferredMac(cohortId, macId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    const e = studentEnrolment(cohortId, u);
    if (!e) return fail('forbidden');
    if (cohortId === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    if (macId === null) {
      prefs.delete(e.id);
      return ok({ preferred_mac_id: null, preferred_mac_no: null });
    }
    const m = macs.find((x) => x.id === macId);
    if (!m || m.status !== 'in_service') return fail('not_found');
    prefs.set(e.id, m.id);
    return ok({ preferred_mac_id: m.id, preferred_mac_no: m.no });
  },

  async adminListMacs() {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!canRead(u)) return fail('forbidden');
    return ok([...macs].sort((a, b) => a.no - b.no));
  },

  async adminUpsertMac(input) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    if (!Number.isInteger(input.no) || input.no < 1 || (input.status !== 'in_service' && input.status !== 'out_of_service')) {
      return fail('invalid_input');
    }
    const clash = macs.find((m) => m.no === input.no && m.id !== input.id);
    if (clash) return fail('conflict');
    const label = input.label?.trim() || null;
    const notes = input.notes?.trim() || null;
    const stamp = toIso(nowMs());
    if (input.id) {
      const m = macs.find((x) => x.id === input.id);
      if (!m) return fail('not_found');
      Object.assign(m, { no: input.no, label, status: input.status, notes, updated_at: stamp });
      return ok({ ...m });
    }
    const m: Mac = { id: newId('000000003'), no: input.no, label, status: input.status, notes, created_at: stamp, updated_at: stamp };
    macs.push(m);
    return ok({ ...m });
  },

  async getLabHours() {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!canRead(u)) return fail('forbidden');
    return ok([...hours].sort((a, b) => a.weekday - b.weekday));
  },

  async adminSetLabHours(input) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    const valid =
      Array.isArray(input) &&
      new Set(input.map((h) => h.weekday)).size === input.length &&
      input.every(
        (h) =>
          Number.isInteger(h.weekday) && h.weekday >= 1 && h.weekday <= 7 &&
          /^([01]\d|2[0-4]):00$/.test(h.open_time) && /^([01]\d|2[0-4]):00$/.test(h.close_time) &&
          hourNum(h.open_time) < hourNum(h.close_time),
      );
    if (!valid) return fail('invalid_input');
    hours = input.map((h) => ({ weekday: h.weekday, open_time: h.open_time, close_time: h.close_time }));
    return ok([...hours].sort((a, b) => a.weekday - b.weekday));
  },

  async listClosures(from, to) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!canRead(u)) return fail('forbidden');
    if (!validDate(from) || !validDate(to)) return fail('invalid_input');
    return ok(closures.filter((c) => c.date >= from && c.date <= to).sort((a, b) => a.date.localeCompare(b.date)));
  },

  async adminAddClosures(items) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin && !isInstructor(u)) return fail('forbidden');
    const kinds: ClosureKind[] = ['holiday', 'closed', 'class_day'];
    if (!Array.isArray(items) || items.length < 1 || items.length > 366 || items.some((i) => !validDate(i.date) || !kinds.includes(i.kind))) {
      return fail('invalid_input');
    }
    if (!u.profile.is_admin && items.some((i) => i.kind !== 'closed')) return fail('forbidden');
    let added = 0;
    let updated = 0;
    for (const i of items) {
      const reason = i.reason?.trim() || null;
      const existing = closures.find((c) => c.date === i.date && c.kind === i.kind);
      if (existing) {
        existing.reason = reason;
        updated += 1;
      } else {
        closures.push({ id: newId('000000005'), date: i.date, kind: i.kind, reason, range_id: null, created_by: u.profile.id, created_at: toIso(nowMs()) });
        added += 1;
      }
    }
    let withdrawn = 0;
    for (const date of new Set(items.map((i) => i.date))) withdrawn += withdrawForClosure(date, items.find((i) => i.date === date)?.reason?.trim() || null);
    return ok({ added, updated, withdrawn });
  },

  async adminAddClosureRange(input) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin && !isInstructor(u)) return fail('forbidden');
    const kinds: ClosureKind[] = ['holiday', 'closed', 'class_day'];
    if (!input || !validDate(input.from) || !validDate(input.to) || !kinds.includes(input.kind)) return fail('invalid_input');
    const span = diffDays(input.from, input.to);
    if (span < 0 || span > 365) return fail('invalid_input');
    if (!u.profile.is_admin && input.kind !== 'closed') return fail('forbidden');
    const reason = input.reason?.trim() || null;
    const rangeId = newId('000000006');
    let added = 0;
    let updated = 0;
    for (let i = 0; i <= span; i += 1) {
      const date = addDays(input.from, i);
      const existing = closures.find((c) => c.date === date && c.kind === input.kind);
      if (existing) {
        existing.reason = reason;
        existing.range_id = rangeId;
        updated += 1;
      } else {
        closures.push({ id: newId('000000005'), date, kind: input.kind, reason, range_id: rangeId, created_by: u.profile.id, created_at: toIso(nowMs()) });
        added += 1;
      }
    }
    let withdrawn = 0;
    for (let i = 0; i <= span; i += 1) withdrawn += withdrawForClosure(addDays(input.from, i), reason);
    return ok({ added, updated, range_id: rangeId, withdrawn });
  },

  async adminDeleteClosure(id, wholeRange = false) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin && !isInstructor(u)) return fail('forbidden');
    const row = closures.find((c) => c.id === id);
    if (!row) return fail('not_found');
    const targets = wholeRange && row.range_id ? closures.filter((c) => c.range_id === row.range_id) : [row];
    if (!u.profile.is_admin && targets.some((c) => c.kind !== 'closed')) return fail('forbidden');
    closures = closures.filter((c) => !targets.includes(c));
    return ok({ ok: true as const, deleted: targets.length });
  },

  async adminListLabBookings(from, to) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin && !isInstructor(u)) return fail('forbidden');
    if (!rangeOk(from, to)) return fail('invalid_input');
    const rows: LabBookingRow[] = [];
    for (const b of bookings) {
      const d = dateOf(b.slot_ms);
      if (d < from || d > to) continue;
      const enrol = findStudentEnrolmentById(b.enrolment_id);
      const profile = enrol ? MOCK_USERS.find((x) => x.profile.id === enrol.user_id)!.profile : fillerProfile(b.enrolment_id);
      rows.push({
        id: b.id,
        slot_start: toIso(b.slot_ms),
        status: b.status,
        cohort_code: MOCK_COHORT.code,
        enrolment_id: b.enrolment_id,
        email: profile.email,
        index_no: profile.index_no,
        first_name: profile.first_name,
        last_name: profile.last_name,
        group_no: enrol ? mockGroupOf(enrol.id).group_no : null,
        preferred_mac_no: macNo(b.preferred_mac_id),
      });
    }
    rows.sort((a, b) => a.slot_start.localeCompare(b.slot_start) || (a.index_no ?? '').localeCompare(b.index_no ?? ''));
    return ok(rows);
  },

  async adminLabCredits(cohortId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin && !(isInstructor(u) && cohortId === MOCK_COHORT.id)) return fail('forbidden');
    const k = cycleNoOf(today());
    const rows: LabCreditRow[] = mockActiveStudents(cohortId).map((e) => {
      const p = MOCK_USERS.find((x) => x.profile.id === e.user_id)!.profile;
      const c = creditsOf(e.id, k);
      const suspended = isSuspended(e.id);
      return {
        enrolment_id: e.id,
        email: p.email,
        index_no: p.index_no,
        first_name: p.first_name,
        last_name: p.last_name,
        group_no: mockGroupOf(e.id).group_no,
        eligible: labOpenFor(cohortId) && mockGroupOf(e.id).has_mac === false && !suspended,
        allowance: c.allowance,
        used: c.used,
        remaining: c.remaining,
        no_shows: noShows(e.id),
        suspended,
        upcoming: bookings.filter((b) => b.enrolment_id === e.id && b.status === 'booked' && b.slot_ms > nowMs()).length,
      };
    });
    rows.sort((a, b) => (a.index_no ?? '').localeCompare(b.index_no ?? '') || a.email.localeCompare(b.email));
    return ok(rows);
  },

  async adminAdjustCredits(enrolmentId, amount, reason) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    if (!Number.isInteger(amount) || amount === 0 || amount < -50 || amount > 50 || !reason?.trim()) return fail('invalid_input');
    const e = findStudentEnrolmentById(enrolmentId);
    if (!e) return fail('not_found');
    if (e.cohort_id === MOCK_ARCHIVED_COHORT.id) return fail('cohort_archived');
    const k = cycleNoOf(today());
    adjustments.push({ enrolment_id: e.id, cycle_no: k, amount, reason: reason.trim() });
    const { allowance, used, remaining } = creditsOf(e.id, k);
    return ok({ allowance, used, remaining });
  },

  async adminClearSuspension(enrolmentId) {
    const u = currentUser();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    const e = findStudentEnrolmentById(enrolmentId);
    if (!e) return fail('not_found');
    if (!isSuspended(e.id)) return fail('conflict');
    cleared.set(e.id, nowMs());
    return ok({ suspended: false as const });
  },
};

/** Test helper: force a status on a booking (stands in for S4 check-in / no-show job). */
export function mockSetBookingStatus(bookingId: string, status: BookingStatus): void {
  const b = bookings.find((x) => x.id === bookingId);
  if (b) b.status = status;
}
