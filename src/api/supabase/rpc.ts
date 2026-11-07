import type { Result } from '../types';
import { getSupabase } from './client';
import { fail, internalError, mapPostgrestError, ok } from './errors';

/** Calls an RPC with named `p_` args; jsonb results are cast to the contract type. */
export async function callRpc<T>(name: string, args?: Record<string, unknown>): Promise<Result<T>> {
  try {
    const sb = getSupabase();
    const rpc = sb.rpc.bind(sb) as unknown as (
      fn: string,
      a?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null }>;
    const { data, error } = await rpc(name, args);
    if (error) {
      const e = mapPostgrestError(error);
      return fail(e.code, e.message, e.details);
    }
    return ok(data as T);
  } catch {
    return internalError();
  }
}
