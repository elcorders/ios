import type { S2Api } from '../types';
import { callRpc } from './rpc';

/** S2 survey methods (CONTRACT.md §S2). */
export const surveyMethods: S2Api = {
  submitSurvey: (cohortId, hasMac) => callRpc('submit_survey', { p_cohort_id: cohortId, p_has_mac: hasMac }),
  adminListSurvey: (cohortId) => callRpc('admin_list_survey', { p_cohort_id: cohortId }),
};
