import type { S10Api, S2Api } from '../types';
import { callRpc } from './rpc';

/** S2 survey methods (CONTRACT.md §S2) + S10 reset. */
export const surveyMethods: S2Api & S10Api = {
  submitSurvey: (cohortId, hasMac) => callRpc('submit_survey', { p_cohort_id: cohortId, p_has_mac: hasMac }),
  adminListSurvey: (cohortId) => callRpc('admin_list_survey', { p_cohort_id: cohortId }),
  adminResetSurvey: (cohortId, enrolmentIds) =>
    callRpc('admin_reset_survey', { p_cohort_id: cohortId, p_enrolment_ids: enrolmentIds }),
};
