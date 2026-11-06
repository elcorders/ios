import type { Api } from '../types';

export const mockApi: Api = {
  async health() {
    return { ok: true, data: { adapter: 'mock', ok: true } };
  },
};
