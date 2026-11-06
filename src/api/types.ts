/** Shared API conventions. Slice types are added by the coordinator. */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** ISO 8601 date-time with offset, e.g. 2026-01-15T09:30:00+05:30. */
export type IsoDateTime = string;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Api {
  health(): Promise<Result<{ adapter: 'mock' | 'supabase'; ok: boolean }>>;
}
