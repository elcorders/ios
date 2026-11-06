import type { Api } from '../types';

export const supabaseApi: Api = {
  async health() {
    return { ok: true, data: { adapter: 'supabase', ok: true } };
  },
};
