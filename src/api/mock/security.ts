import type { Api, ApiError, Result } from '../types';
import { MOCK_CODE } from './fixtures/s1';
import { updateCurrentMockSecurity } from './auth';

const fail = <T>(code: string): Result<T> => ({ ok: false, error: { code, message: code } satisfies ApiError });

export const MOCK_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
let enrolling = false;

/** Mock security-setup methods (S1.F2). */
export const mockSecurity: Partial<Api> = {
  async registerPasskey() {
    return updateCurrentMockSecurity({ addPasskey: true }) ? { ok: true, data: undefined } : fail('not_authenticated');
  },
  async totpEnrol() {
    enrolling = true;
    return {
      ok: true,
      data: {
        factor_id: '00000000-0000-4000-8000-0000000009f1',
        otpauth_uri: `otpauth://totp/IOS:student@example.edu?secret=${MOCK_TOTP_SECRET}&issuer=IOS`,
        secret: MOCK_TOTP_SECRET,
      },
    };
  },
  async totpVerify(code) {
    if (!enrolling) return fail('invalid_input');
    if (code !== MOCK_CODE) return fail('invalid_code');
    if (!updateCurrentMockSecurity({ totp: true })) return fail('not_authenticated');
    enrolling = false;
    return { ok: true, data: { enrolled: true } };
  },
};
