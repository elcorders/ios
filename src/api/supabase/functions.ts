import type { Result } from '../types';
import { getSupabase } from './client';
import { fail, internalError, mapFunctionError, ok } from './errors';

/** Invokes an Edge Function (POST JSON) and maps `{ error: { code, message, details } }` bodies. */
export async function callFunction<T>(name: string, body: unknown): Promise<Result<T>> {
  try {
    const { data, error } = await getSupabase().functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      const e = await mapFunctionError(error);
      return fail(e.code, e.message, e.details);
    }
    return ok(data as T);
  } catch {
    return internalError();
  }
}
