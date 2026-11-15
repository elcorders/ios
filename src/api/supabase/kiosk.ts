import { createClient } from '@supabase/supabase-js';
import type { ApiError, KioskDevice, KioskFeed, KioskPairStart, Result, S21Api } from '../types';
import type { Database } from '../db.gen';
import { fail, internalError, mapFunctionError, mapPostgrestError, ok } from './errors';
import type { Supabase } from './client';
import { callFunction } from './functions';
import { callRpc } from './rpc';

/**
 * S21 kiosk (CONTRACT §S21). The kiosk uses its own Supabase client: no persisted session, no auto refresh,
 * tokens in memory only, never shared with the signed-in person's session.
 */
let kioskClient: Supabase | undefined;

function getKiosk(): Supabase {
  if (kioskClient) return kioskClient;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required when VITE_API=supabase');
  }
  kioskClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'nibm-kiosk' },
  });
  return kioskClient;
}

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Kiosk Edge Functions are anonymous: send the publishable key, never a (possibly stale) session token. */
async function kioskFunction<T>(body: unknown): Promise<Result<T>> {
  try {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const { data, error } = await getKiosk().functions.invoke('kiosk-login', {
      body: body as Record<string, unknown>,
      headers: { Authorization: `Bearer ${key}` },
    });
    if (error) {
      const e = await mapFunctionError(error);
      return fail(e.code, e.message, e.details);
    }
    return ok(data as T);
  } catch {
    return internalError();
  }
}

/** RPC through the kiosk client. An expired / rejected token (401, PGRST301/303) is `forbidden` (the kiosk signs in again). */
async function kioskRpc<T>(name: string, args?: Record<string, unknown>): Promise<Result<T>> {
  try {
    const sb = getKiosk();
    const rpc = sb.rpc.bind(sb) as unknown as (
      fn: string,
      a?: Record<string, unknown>,
    ) => PromiseLike<{
      data: unknown;
      status?: number;
      error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null;
    }>;
    const { data, status, error } = await rpc(name, args);
    if (error) {
      const e: ApiError = mapPostgrestError(error);
      const expired = status === 401 || e.code === 'not_authenticated' || /jwt/i.test(error.message ?? '');
      if (expired) return fail('forbidden', 'This screen needs to sign in again.');
      return fail(e.code, e.message, e.details);
    }
    return ok(data as T);
  } catch {
    return internalError();
  }
}

export const kioskMethods: S21Api = {
  kioskPairStart: (publicKey) =>
    callFunction<KioskPairStart>('kiosk-pair', { action: 'start', public_key: publicKey }),
  kioskPairStatus: (pairingId) => callFunction('kiosk-pair', { action: 'status', pairing_id: pairingId }),

  async kioskSignIn(deviceId, sign) {
    const ch = await kioskFunction<{ nonce: string }>({ action: 'challenge', device_id: deviceId });
    if (!ch.ok) return ch;
    let signature: string;
    try {
      const message = new TextEncoder().encode(`nibm-kiosk-v1\n${deviceId}\n${ch.data.nonce}`);
      signature = b64url(await sign(message));
    } catch {
      return internalError();
    }
    const v = await kioskFunction<{ access_token: string; refresh_token: string; expires_at: number }>({
      action: 'verify', device_id: deviceId, nonce: ch.data.nonce, signature,
    });
    if (!v.ok) return v;
    try {
      const { error } = await getKiosk().auth.setSession({
        access_token: v.data.access_token,
        refresh_token: v.data.refresh_token,
      });
      if (error) return internalError();
    } catch {
      return internalError();
    }
    // The function returns epoch seconds; the contract type is an ISO string.
    return ok({ expires_at: new Date(v.data.expires_at * 1000).toISOString() });
  },
  async kioskSignOut() {
    if (kioskClient) await kioskClient.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return ok({ ok: true as const });
  },
  kioskHeartbeat: () => kioskRpc('kiosk_heartbeat'),
  kioskFeed: () => kioskRpc<KioskFeed>('kiosk_feed'),
  kioskGetContent: (id) => kioskRpc('kiosk_get_content', { p_id: id }),

  kioskPairLookup: (code) => callRpc('kiosk_pair_lookup', { p_code: code }),
  kioskPairApprove: (code, name, cohortId) =>
    callRpc<KioskDevice>('kiosk_pair_approve', { p_code: code, p_name: name, p_cohort_id: cohortId ?? null }),

  adminListKiosks: () => callRpc('admin_list_kiosks'),
  adminUpdateKiosk: (id, name, cohortId) => callRpc('admin_update_kiosk', { p_id: id, p_name: name, p_cohort_id: cohortId }),
  adminRevokeKiosk: (id) => callRpc('admin_revoke_kiosk', { p_id: id }),
  adminSetKioskCohort: (cohortId) => callRpc('admin_set_kiosk_cohort', { p_cohort_id: cohortId }),
};
