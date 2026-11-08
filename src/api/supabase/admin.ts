import type { Me, PendingRegistration, S1Api, S7Api, S9Api } from '../types';
import { getSupabase } from './client';
import { callFunction } from './functions';
import { fail, internalError, mapPostgrestError, ok } from './errors';
import { callRpc } from './rpc';
import type { AuthMethods } from './auth';

type DataMethods = Omit<S1Api, keyof AuthMethods> & S7Api & S9Api;

export const dataMethods: DataMethods = {
  lmsLanding: (p) =>
    callRpc('lms_landing', {
      p_key: p.key,
      p_course_id: p.course_id,
      p_idnumber: p.idnumber ?? null,
      p_username: p.username ?? null,
      p_email: p.email,
      p_first: p.first ?? null,
      p_last: p.last ?? null,
    }),

  // Signed-out callers hit a permission error (get_me is not granted to anon): report it as not_authenticated.
  async getMe() {
    const r = await callRpc<Me>('get_me');
    return !r.ok && r.error.code === 'forbidden'
      ? fail('not_authenticated', 'Please sign in again.')
      : r;
  },
  adminListCohorts: () => callRpc('admin_list_cohorts'),

  adminUpsertCohort: (i) =>
    callRpc('admin_upsert_cohort', {
      p_id: i.id,
      p_code: i.code,
      p_batch: i.batch,
      p_lms_course_id: i.lms_course_id,
      p_course_key: i.course_key,
      p_status: i.status,
    }),

  adminUpdateCohortSettings: (cohortId, patch) =>
    callRpc('admin_update_cohort_settings', { p_cohort_id: cohortId, p_patch: patch }),

  listMembers: (cohortId, role) =>
    callRpc('admin_list_members', { p_cohort_id: cohortId, p_role: role ?? null }),

  adminUpdateProfile: (i) =>
    callRpc('admin_update_profile', {
      p_user_id: i.user_id,
      p_first_name: i.first_name,
      p_last_name: i.last_name,
      p_index_no: i.index_no,
      p_lms_username: i.lms_username,
      p_phone: i.phone,
    }),

  async adminSetEnrolmentStatus(enrolmentId, status) {
    const r = await callRpc<{ id: string; status: typeof status }>('admin_set_enrolment_status', {
      p_enrolment_id: enrolmentId,
      p_status: status,
    });
    return r.ok ? ok({ id: r.data.id, status: r.data.status }) : r;
  },

  rosterImport: (input) => callFunction('roster-import', input),

  async adminListPending(cohortId) {
    try {
      const { data, error } = await getSupabase()
        .from('pending_registrations')
        .select('id, cohort_id, email, idnumber, lms_username, first_name, last_name, status, created_at, decided_at, decided_by')
        .eq('cohort_id', cohortId)
        .order('created_at', { ascending: false });
      if (error) {
        const e = mapPostgrestError(error);
        return fail(e.code, e.message, e.details);
      }
      const rows: PendingRegistration[] = (data ?? []).map((r) => ({
        id: r.id,
        cohort_id: r.cohort_id,
        email: r.email,
        idnumber: r.idnumber,
        lms_username: r.lms_username,
        first_name: r.first_name,
        last_name: r.last_name,
        status: r.status,
        created_at: r.created_at,
        decided_at: r.decided_at,
        decided_by: r.decided_by,
      }));
      return ok(rows);
    } catch {
      return internalError();
    }
  },

  approvePending: (pendingId) => callFunction('pending-approve', { pending_id: pendingId }),
  rejectPending: (pendingId) => callRpc('admin_reject_pending', { p_pending_id: pendingId }),
  adminSetPendingStatus: (pendingId, status) => callRpc('admin_set_pending_status', { p_pending_id: pendingId, p_status: status }),
  adminResetSecurity: (userId, what) => callFunction('admin-reset-security', { user_id: userId, what }),
  adminChangeEmail: (userId, email) => callFunction('admin-change-email', { user_id: userId, email }),
};
