import type { S14Api } from '../types';
import { callRpc } from './rpc';

/** S14 class sessions + S24 class templates (CONTRACT.md §S14, §S24). */
export const sessionMethods: S14Api = {
  adminListClassSessions: (cohortId) => callRpc('admin_list_class_sessions', { p_cohort_id: cohortId }),
  adminUpsertClassSession: (i) =>
    callRpc('admin_upsert_class_session', {
      p_id: i.id, p_cohort_id: i.cohort_id, p_date: i.date, p_title: i.title, p_slots: i.slots,
      p_deliverables: i.deliverables, p_lab_block_until: i.lab_block_until, p_template_id: i.template_id,
    }),
  adminDeleteClassSession: (id) => callRpc('admin_delete_class_session', { p_id: id }),
  getMySessions: (cohortId) => callRpc('get_my_sessions', { p_cohort_id: cohortId }),
  adminListClassTemplates: () => callRpc('admin_list_class_templates', {}),
  adminUpsertClassTemplate: (i) => callRpc('admin_upsert_class_template', { p_id: i.id, p_name: i.name, p_slots: i.slots }),
  adminDeleteClassTemplate: (id) => callRpc('admin_delete_class_template', { p_id: id }),
};
