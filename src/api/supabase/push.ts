import type { S16Api } from '../types';
import { callFunction } from './functions';
import { callRpc } from './rpc';

/** S16 web push (CONTRACT.md §S16). */
export const pushMethods: S16Api = {
  savePushSubscription: (s) =>
    callRpc('save_push_subscription', { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_user_agent: s.user_agent }),
  deletePushSubscription: (endpoint) => callRpc('delete_push_subscription', { p_endpoint: endpoint }),
  getMyPush: () => callRpc('get_my_push'),
  adminPushStats: () => callRpc('admin_push_stats'),
  adminPushTest: () => callRpc('admin_push_test'),
  adminPushSend: () => callFunction('push-send', {}),
};
