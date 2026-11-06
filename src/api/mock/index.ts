import type { Api } from '../types';
import { notImplemented } from '../stub';
import { mockAuth } from './auth';

export const mockApi: Api = {
  ...notImplemented('mock'),
  ...mockAuth,
  async health() {
    return { ok: true, data: { adapter: 'mock', ok: true } };
  },
};
