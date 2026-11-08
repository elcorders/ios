import type { Api } from '../types';
import { notImplemented } from '../stub';
import { authMethods } from './auth';
import { dataMethods } from './admin';
import { surveyMethods } from './survey';
import { contentMethods } from './content';
import { transferMethods } from './transfers';
import { labMethods } from './lab';

/** Supabase adapter. The client is created lazily, on the first method call that needs it. */
export const supabaseApi: Api = {
  ...notImplemented('supabase'),
  ...authMethods,
  ...dataMethods,
  ...surveyMethods,
  ...contentMethods,
  ...transferMethods,
  ...labMethods,
  async health() {
    return { ok: true, data: { adapter: 'supabase', ok: true } };
  },
};
