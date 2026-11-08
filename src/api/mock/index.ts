import type { Api } from '../types';
import { notImplemented } from '../stub';
import { mockAdmin } from './admin';
import { mockAuth } from './auth';
import { mockSecurity } from './security';
import { mockSurvey } from './survey';
import { mockContent } from './content';
import { mockTransfers } from './transfers';
import { mockLab } from './lab';

export const mockApi: Api = {
  ...notImplemented('mock'),
  ...mockAuth,
  ...mockSecurity,
  ...mockAdmin,
  ...mockSurvey,
  ...mockContent,
  ...mockTransfers,
  ...mockLab,
  async health() {
    return { ok: true, data: { adapter: 'mock', ok: true } };
  },
};
