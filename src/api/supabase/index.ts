import type { Api } from '../types';
import { notImplemented } from '../stub';
import { authMethods } from './auth';
import { dataMethods } from './admin';
import { surveyMethods } from './survey';
import { contentMethods } from './content';
import { transferMethods } from './transfers';
import { labMethods } from './lab';
import { sessionMethods } from './sessions';
import { pushMethods } from './push';

/** Supabase adapter. The client is created lazily, on the first method call that needs it. */
export const supabaseApi: Api = {
  ...notImplemented('supabase'),
  ...authMethods,
  ...dataMethods,
  ...surveyMethods,
  ...contentMethods,
  ...transferMethods,
  ...labMethods,
  ...sessionMethods,
  ...pushMethods,
  async health() {
    return { ok: true, data: { adapter: 'supabase', ok: true } };
  },
};
