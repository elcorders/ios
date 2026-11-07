import { describe, expect, it } from 'vitest';
import { notImplemented } from './stub';

describe('S1 stubs', () => {
  it('return not_implemented instead of throwing', async () => {
    const r = await notImplemented('mock').adminListCohorts();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_implemented');
  });
});

describe('S2 stubs', () => {
  it('both adapters return not_implemented for S2 until F/I tasks', async () => {
    const { mockApi } = await import('./mock');
    const { supabaseApi } = await import('./supabase');
    for (const a of [mockApi, supabaseApi]) {
      const r = await a.getGrouping('c1');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('not_implemented');
    }
  });
});
