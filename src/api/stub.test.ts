import { describe, expect, it } from 'vitest';
import { notImplemented } from './stub';

describe('S1 stubs', () => {
  it('return not_implemented instead of throwing', async () => {
    const r = await notImplemented('mock').adminListCohorts();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_implemented');
  });
});

