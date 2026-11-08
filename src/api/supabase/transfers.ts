import type { S8Api } from '../types';
import { callFunction } from './functions';
import { callRpc } from './rpc';

/** S8 transfer methods (CONTRACT.md §S8). */
export const transferMethods: S8Api = {
  getMyTransfers: (cohortId) => callRpc('get_my_transfers', { p_cohort_id: cohortId }),
  requestTransfer: ({ cohortId, pref1No, pref2No, reason }) =>
    callRpc('request_transfer', { p_cohort_id: cohortId, p_pref1_no: pref1No, p_pref2_no: pref2No, p_reason: reason }),
  cancelTransfer: (requestId) => callRpc('cancel_transfer', { p_request_id: requestId }),
  adminListTransfers: (cohortId) => callRpc('admin_list_transfers', { p_cohort_id: cohortId }),
  adminDecideTransfer: ({ requestId, approve, groupNo, note }) =>
    callRpc('admin_decide_transfer', { p_request_id: requestId, p_approve: approve, p_group_no: groupNo, p_note: note }),
  adminApproveSwap: (requestA, requestB, note = null) =>
    callRpc('admin_approve_swap', { p_request_a: requestA, p_request_b: requestB, p_note: note }),
  adminMoveStudent: ({ enrolmentId, groupNo, note }) =>
    callRpc('admin_move_student', { p_enrolment_id: enrolmentId, p_group_no: groupNo, p_note: note }),
  adminSendOutbox: (retryFailed = false) => callFunction('outbox-send', { retry_failed: retryFailed }),
};
