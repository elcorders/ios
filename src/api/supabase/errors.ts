import type { ApiError, Result } from '../types';

export const fail = (code: string, message: string, details?: unknown): { ok: false; error: ApiError } => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const internalError = (): { ok: false; error: ApiError } =>
  fail('internal', 'Something went wrong. Please try again.');

interface PostgrestLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

function parseJson(text: string | null | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Maps a PostgREST error (CONTRACT: Errors). `P0001` carries our code in `message`. */
export function mapPostgrestError(err: PostgrestLike): ApiError {
  if (err.code === 'P0001' && err.message) {
    const details = parseJson(err.hint);
    return {
      code: err.message,
      message: err.details || err.message,
      ...(details !== undefined && details !== null ? { details } : {}),
    };
  }
  if (err.code === 'PGRST301' || err.code === 'PGRST303') {
    return { code: 'not_authenticated', message: 'Please sign in again.' };
  }
  if (err.code === '42501') return { code: 'forbidden', message: 'You are not allowed to do that.' };
  return { code: 'internal', message: 'Something went wrong. Please try again.' };
}

/** Maps a thrown value or `error` from an Edge Function call. */
export async function mapFunctionError(err: unknown): Promise<ApiError> {
  const e = err as { name?: string; context?: unknown } | null;
  if (e?.name === 'FunctionsHttpError' && e.context && typeof (e.context as Response).json === 'function') {
    try {
      const body = (await (e.context as Response).json()) as { error?: { code?: string; message?: string; details?: unknown } };
      if (body?.error?.code) {
        const { code, message, details } = body.error;
        return {
          code,
          message: message ?? code,
          ...(details !== undefined && details !== null ? { details } : {}),
        };
      }
    } catch {
      // fall through
    }
  }
  return { code: 'internal', message: 'Something went wrong. Please try again.' };
}

interface AuthLike {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
}

/** Generic Supabase Auth error mapping (not flow-specific). */
export function mapAuthError(err: AuthLike): ApiError {
  const code = err.code ?? '';
  if (err.status === 429 || code.startsWith('over_') || code === 'over_request_rate_limit') {
    return { code: 'rate_limited', message: 'Too many attempts. Please wait a moment and try again.' };
  }
  if (err.status === 401 || code === 'session_not_found' || code === 'refresh_token_not_found' || err.name === 'AuthSessionMissingError') {
    return { code: 'not_authenticated', message: 'Please sign in again.' };
  }
  return { code: 'internal', message: 'Something went wrong. Please try again.' };
}
