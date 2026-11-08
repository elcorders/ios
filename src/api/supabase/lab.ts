import type { Closure, LabHours, Mac, S3Api } from '../types';
import { getSupabase } from './client';
import { fail, internalError, mapPostgrestError, ok } from './errors';
import { callRpc } from './rpc';

/** "09:00:00" -> "09:00" (direct selects return seconds, RPCs don't). */
const hhmm = (t: string): string => t.slice(0, 5);
const trimHours = (rows: LabHours[]): LabHours[] =>
  rows.map((h) => ({ weekday: h.weekday, open_time: hhmm(h.open_time), close_time: hhmm(h.close_time) }));

async function select<T>(run: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null }>) {
  try {
    const { data, error } = await run();
    if (error) {
      const e = mapPostgrestError(error);
      return fail(e.code, e.message, e.details);
    }
    return ok((data ?? []) as T);
  } catch {
    return internalError();
  }
}

/** S3 lab methods (CONTRACT.md §S3). */
export const labMethods: S3Api = {
  getLabCalendar: (from, to) => callRpc('get_lab_calendar', { p_from: from, p_to: to }),
  getMyLab: (cohortId) => callRpc('get_my_lab', { p_cohort_id: cohortId }),
  bookSlots: (cohortId, slotStarts) => callRpc('book_slots', { p_cohort_id: cohortId, p_slot_starts: slotStarts }),
  withdrawBooking: (bookingId) => callRpc('withdraw_booking', { p_booking_id: bookingId }),
  setPreferredMac: (cohortId, macId) => callRpc('set_preferred_mac', { p_cohort_id: cohortId, p_mac_id: macId }),

  adminListMacs: () =>
    select<Mac[]>(() =>
      getSupabase().from('macs').select('id, no, label, status, notes, created_at, updated_at').order('no')),
  adminUpsertMac: (m) =>
    callRpc('admin_upsert_mac', { p_id: m.id, p_no: m.no, p_label: m.label, p_status: m.status, p_notes: m.notes }),

  async getLabHours() {
    const r = await select<LabHours[]>(() =>
      getSupabase().from('lab_hours').select('weekday, open_time, close_time').order('weekday'));
    return r.ok ? ok(trimHours(r.data)) : r;
  },
  async adminSetLabHours(hours) {
    const r = await callRpc<LabHours[]>('admin_set_lab_hours', { p_hours: hours });
    return r.ok ? ok(trimHours(r.data ?? [])) : r;
  },

  listClosures: (from, to) =>
    select<Closure[]>(() =>
      getSupabase()
        .from('lab_closures')
        .select('id, date, kind, reason, created_by, created_at')
        .gte('date', from)
        .lte('date', to)
        .order('date')),
  adminAddClosures: (items) => callRpc('admin_add_closures', { p_items: items }),
  adminDeleteClosure: (id) => callRpc('admin_delete_closure', { p_id: id }),

  adminListLabBookings: (from, to) => callRpc('admin_list_lab_bookings', { p_from: from, p_to: to }),
  adminLabCredits: (cohortId) => callRpc('admin_lab_credits', { p_cohort_id: cohortId }),
  adminAdjustCredits: (enrolmentId, amount, reason) =>
    callRpc('admin_adjust_credits', { p_enrolment_id: enrolmentId, p_amount: amount, p_reason: reason }),
  adminClearSuspension: (enrolmentId) => callRpc('admin_clear_suspension', { p_enrolment_id: enrolmentId }),
};
