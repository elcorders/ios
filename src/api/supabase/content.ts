import type { S6Api, S17Api } from '../types';
import { callRpc } from './rpc';

/** S6 content methods (CONTRACT.md §S6). */
export const contentMethods: S6Api & S17Api = {
  listContent: (kind) => callRpc('list_content', { p_kind: kind }),
  getContent: (id) => callRpc('get_content', { p_id: id }),
  adminListContent: (kind, cohortId) => callRpc('admin_list_content', { p_kind: kind, p_cohort_id: cohortId }),
  adminGetContent: (id) => callRpc('admin_get_content', { p_id: id }),
  adminUpsertContent: (i) =>
    callRpc('admin_upsert_content', {
      p_id: i.id, p_kind: i.kind, p_cohort_id: i.cohort_id, p_title: i.title,
      p_summary: i.summary, p_position: i.position, p_body_html: i.body_html,
    }),
  adminSetContentPublish: (id, publishedAt, notify) =>
    callRpc('admin_set_content_publish', { p_id: id, p_published_at: publishedAt, p_notify: notify ?? null }),
  adminDeleteContent: (id) => callRpc('admin_delete_content', { p_id: id }),
  adminCopyTutorials: (from, to) => callRpc('admin_copy_tutorials', { p_from_cohort_id: from, p_to_cohort_id: to }),
  // S17 — library + versions
  adminListLibrary: (kind) => callRpc('admin_list_library', { p_kind: kind }),
  adminGetLibrary: (id) => callRpc('admin_get_library', { p_id: id }),
  adminUpsertLibrary: (id, title, summary) => callRpc('admin_upsert_library', { p_id: id, p_title: title, p_summary: summary }),
  adminAddLibraryVersion: (id, bodyHtml, note) => callRpc('admin_add_library_version', { p_id: id, p_body_html: bodyHtml, p_note: note }),
  adminSetLinkVersions: (versionId, contentIds) => callRpc('admin_set_link_versions', { p_version_id: versionId, p_content_ids: contentIds }),
  adminLinkLibrary: (id, cohortId, versionId, position) =>
    callRpc('admin_link_library', { p_id: id, p_cohort_id: cohortId, p_version_id: versionId, p_position: position }),
  adminDeleteLibrary: (id) => callRpc('admin_delete_library', { p_id: id }),
};
