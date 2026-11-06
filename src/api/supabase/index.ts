import type { Api } from '../types';
import { notImplemented } from '../stub';

export const supabaseApi: Api = {
  ...notImplemented('supabase'),
  async health() {
    return { ok: true, data: { adapter: 'supabase', ok: true } };
  },
};
