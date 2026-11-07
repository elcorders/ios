import type { Api } from '../types';
import { notImplemented } from '../stub';
import { authMethods } from './auth';
import { dataMethods } from './admin';

/** Supabase adapter. The client is created lazily, on the first method call that needs it. */
export const supabaseApi: Api = {
  ...notImplemented('supabase'),
  ...authMethods,
  ...dataMethods,
  async health() {
    return { ok: true, data: { adapter: 'supabase', ok: true } };
  },
};
