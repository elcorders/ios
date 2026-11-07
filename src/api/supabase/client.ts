import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db.gen';

export type Supabase = SupabaseClient<Database>;

let instance: Supabase | undefined;

/** Creates the client on first use, so mock mode never needs the env vars. */
export function getSupabase(): Supabase {
  if (instance) return instance;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required when VITE_API=supabase');
  }
  instance = createClient<Database>(url, key, {
    auth: { experimental: { passkey: true } },
  });
  return instance;
}
