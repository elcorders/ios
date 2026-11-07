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
  it('the supabase adapter returns not_implemented for S2 until S2.I', async () => {
    const { supabaseApi } = await import('./supabase');
    const r = await supabaseApi.adminListSurvey('c1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_implemented');
  });
});
