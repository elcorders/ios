import { describe, expect, it } from 'vitest';
import { mockApi } from './mock';
import { supabaseApi } from './supabase';
import { selectApi } from './index';

describe('selectApi', () => {
  it('defaults to mock', () => {
    expect(selectApi(undefined)).toBe(mockApi);
    expect(selectApi('')).toBe(mockApi);
  });
  it('selects supabase', () => {
    expect(selectApi('supabase')).toBe(supabaseApi);
  });
  it('mock health reports adapter', async () => {
    const r = await selectApi('mock').health();
    expect(r).toEqual({ ok: true, data: { adapter: 'mock', ok: true } });
  });
});
