import type { Api } from '../types';
import { notImplemented } from '../stub';
import { mockAdmin } from './admin';
import { mockAuth } from './auth';
import { mockSecurity } from './security';
import { mockSurvey } from './survey';
import { mockContent } from './content';

export const mockApi: Api = {
  ...notImplemented('mock'),
  ...mockAuth,
  ...mockSecurity,
  ...mockAdmin,
  ...mockSurvey,
  ...mockContent,
  async health() {
    return { ok: true, data: { adapter: 'mock', ok: true } };
  },
};
