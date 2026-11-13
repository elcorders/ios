import type { S16Api, S19Api } from '../types';
import { callFunction } from './functions';
import { callRpc } from './rpc';

/** S16 web push (CONTRACT.md §S16). */
export const pushMethods: S16Api & S19Api = {
  savePushSubscription: (s) =>
    callRpc('save_push_subscription', { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_user_agent: s.user_agent }),
  deletePushSubscription: (endpoint) => callRpc('delete_push_subscription', { p_endpoint: endpoint }),
  getMyPush: () => callRpc('get_my_push'),
  adminPushStats: () => callRpc('admin_push_stats'),
  adminPushTest: () => callRpc('admin_push_test'),
  listMyNotifications: (before) => callRpc('list_my_notifications', { p_before: before ?? null, p_limit: 30 }),
  markNotificationsRead: (ids) => callRpc('mark_notifications_read', { p_ids: ids }),
  adminSetPushKind: (kind, enabled) => callRpc('admin_set_push_kind', { p_kind: kind, p_enabled: enabled }),
  adminPushAudience: (cohortId, groupNos) => callRpc('admin_push_audience', { p_cohort_id: cohortId, p_group_nos: groupNos }),
  adminPushCustom: (i) =>
    callRpc('admin_push_custom', { p_cohort_id: i.cohort_id, p_group_nos: i.group_nos, p_title: i.title, p_body: i.body, p_url: i.url }),
  adminPushLog: () => callRpc('admin_push_log'),
  adminClosureImpact: (from, to) => callRpc('admin_closure_impact', { p_from: from, p_to: to }),
  adminPushSend: () => callFunction('push-send', {}),
};
