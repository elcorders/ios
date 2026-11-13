import type { S14Api } from '../types';
import { callRpc } from './rpc';

/** S14 class sessions (CONTRACT.md §S14). */
export const sessionMethods: S14Api = {
  adminListClassSessions: (cohortId) => callRpc('admin_list_class_sessions', { p_cohort_id: cohortId }),
  adminUpsertClassSession: (i) =>
    callRpc('admin_upsert_class_session', {
      p_id: i.id, p_cohort_id: i.cohort_id, p_date: i.date, p_start_time: null, p_end_time: null,
      p_title: i.title, p_group_nos: null, p_slots: i.slots, p_deliverables: i.deliverables,
      p_lab_block_until: i.lab_block_until, p_content_ids: i.content_ids, p_notify_content_ids: i.notify_content_ids,
    }),
  adminDeleteClassSession: (id) => callRpc('admin_delete_class_session', { p_id: id }),
  getMySessions: (cohortId) => callRpc('get_my_sessions', { p_cohort_id: cohortId }),
};
