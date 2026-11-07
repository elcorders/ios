import type { Api } from '../types';
import { getSupabase } from './client';
import { callFunction } from './functions';
import { fail, internalError, mapAuthError, ok } from './errors';

export type AuthMethods = Pick<
  Api,
  'sendEmailCode' | 'verifyEmailCode' | 'registerPasskey' | 'signInWithPasskey' | 'totpEnrol' | 'totpVerify' | 'totpLogin' | 'signOut'
>;

const NOT_ON_ROSTER_CODES = new Set(['user_not_found', 'signup_disabled', 'otp_disabled', 'email_not_found']);
const INVALID_CODE_CODES = new Set(['otp_expired', 'invalid_otp', 'validation_failed', 'bad_otp']);

interface PasskeyErrorLike {
  name?: string;
  code?: string;
  message?: string;
  status?: number;
  cause?: unknown;
}

function mapPasskeyError(err: PasskeyErrorLike) {
  const names = [err.name, (err.cause as { name?: string } | null | undefined)?.name];
  if (names.includes('NotAllowedError') || names.includes('AbortError') || err.code === 'ERROR_CEREMONY_ABORTED') {
    return fail('passkey_cancelled', 'The passkey prompt was cancelled.');
  }
  if (names.includes('NotSupportedError') || err.code === 'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG' || err.code === 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT') {
    return fail('passkey_unsupported', 'This device does not support passkeys.');
  }
  const e = mapAuthError(err);
  return fail(e.code, e.message);
}

function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}

export const authMethods: AuthMethods = {
  async sendEmailCode(email) {
    try {
      const { error } = await getSupabase().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (!error) return ok(undefined);
      if (error.status === 429 || (error.code ?? '').startsWith('over_')) {
        return fail('rate_limited', 'Too many attempts. Please wait a moment and try again.');
      }
      if (NOT_ON_ROSTER_CODES.has(error.code ?? '') || /signups? not allowed|user not found/i.test(error.message)) {
        return fail('not_on_roster', 'This email is not on a class roster.');
      }
      const e = mapAuthError(error);
      return fail(e.code, e.message);
    } catch {
      return internalError();
    }
  },

  async verifyEmailCode(email, code) {
    try {
      const { error } = await getSupabase().auth.verifyOtp({ email, token: code, type: 'email' });
      if (!error) return ok(undefined);
      if (error.status === 429 || (error.code ?? '').startsWith('over_')) {
        return fail('rate_limited', 'Too many attempts. Please wait a moment and try again.');
      }
      if (INVALID_CODE_CODES.has(error.code ?? '') || error.status === 400 || error.status === 403 || error.status === 422) {
        return fail('invalid_code', 'That code is invalid or has expired.');
      }
      const e = mapAuthError(error);
      return fail(e.code, e.message);
    } catch {
      return internalError();
    }
  },

  async registerPasskey() {
    if (!passkeysSupported()) return fail('passkey_unsupported', 'This device does not support passkeys.');
    try {
      const { error } = await getSupabase().auth.registerPasskey();
      return error ? mapPasskeyError(error) : ok(undefined);
    } catch (e) {
      return mapPasskeyError(e as PasskeyErrorLike);
    }
  },

  async signInWithPasskey() {
    if (!passkeysSupported()) return fail('passkey_unsupported', 'This device does not support passkeys.');
    try {
      const { error } = await getSupabase().auth.signInWithPasskey();
      return error ? mapPasskeyError(error) : ok(undefined);
    } catch (e) {
      return mapPasskeyError(e as PasskeyErrorLike);
    }
  },

  totpEnrol: () => callFunction('totp-enrol', {}),
  totpVerify: (code) => callFunction('totp-verify', { code }),

  async totpLogin(email, code) {
    const r = await callFunction<{ access_token: string; refresh_token: string; expires_at: number }>('totp-login', { email, code });
    if (!r.ok) return r;
    try {
      const { error } = await getSupabase().auth.setSession({
        access_token: r.data.access_token,
        refresh_token: r.data.refresh_token,
      });
      if (error) {
        const e = mapAuthError(error);
        return fail(e.code, e.message);
      }
      return ok(undefined);
    } catch {
      return internalError();
    }
  },

  async signOut() {
    try {
      const { error } = await getSupabase().auth.signOut();
      if (error) {
        const e = mapAuthError(error);
        return fail(e.code, e.message);
      }
      return ok(undefined);
    } catch {
      return internalError();
    }
  },
};
