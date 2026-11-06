import type { Api } from '../types';
import { notImplemented } from '../stub';
import { mockAdmin } from './admin';
import { mockAuth } from './auth';
import { mockSecurity } from './security';

export const mockApi: Api = {
  ...notImplemented('mock'),
  ...mockAuth,
  ...mockSecurity,
  ...mockAdmin,
  async health() {
    return { ok: true, data: { adapter: 'mock', ok: true } };
  },
};
