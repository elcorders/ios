import type { Api } from './types';
import { mockApi } from './mock';
import { supabaseApi } from './supabase';

export type AdapterName = 'mock' | 'supabase';

export function selectApi(name: string | undefined): Api {
  return name === 'supabase' ? supabaseApi : mockApi;
}

export const api: Api = selectApi(import.meta.env.VITE_API);
