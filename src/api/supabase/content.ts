import type { S6Api } from '../types';
import { callRpc } from './rpc';

/** S6 content methods (CONTRACT.md §S6). */
export const contentMethods: S6Api = {
  listContent: (kind) => callRpc('list_content', { p_kind: kind }),
  getContent: (id) => callRpc('get_content', { p_id: id }),
  adminListContent: (kind, cohortId) => callRpc('admin_list_content', { p_kind: kind, p_cohort_id: cohortId }),
  adminGetContent: (id) => callRpc('admin_get_content', { p_id: id }),
  adminUpsertContent: (i) =>
    callRpc('admin_upsert_content', {
      p_id: i.id, p_kind: i.kind, p_cohort_id: i.cohort_id, p_title: i.title,
      p_summary: i.summary, p_position: i.position, p_body_html: i.body_html,
    }),
  adminSetContentPublish: (id, publishedAt) => callRpc('admin_set_content_publish', { p_id: id, p_published_at: publishedAt }),
  adminDeleteContent: (id) => callRpc('admin_delete_content', { p_id: id }),
  adminCopyTutorials: (from, to) => callRpc('admin_copy_tutorials', { p_from_cohort_id: from, p_to_cohort_id: to }),
};
