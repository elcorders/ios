import { describe, expect, it } from 'vitest';
import { mockApi } from './mock';

describe('S1 stubs', () => {
  it('return not_implemented instead of throwing', async () => {
    const r = await mockApi.getMe();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_implemented');
  });
});
