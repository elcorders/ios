import type { Api } from '../types';
import { notImplemented } from '../stub';

export const mockApi: Api = {
  ...notImplemented('mock'),
  async health() {
    return { ok: true, data: { adapter: 'mock', ok: true } };
  },
};
