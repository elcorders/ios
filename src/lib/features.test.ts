import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushEnabledFor, pushFlag } from './features';

describe('push feature flag', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('reads VITE_FEATURE_PUSH, unset = off', () => {
    vi.stubEnv('VITE_FEATURE_PUSH', '');
    expect(pushFlag()).toBe('off');
    vi.stubEnv('VITE_FEATURE_PUSH', 'admin');
    expect(pushFlag()).toBe('admin');
  });
  it('parses values, defaults to off', () => {
    expect(pushFlag('')).toBe('off');
    expect(pushFlag('yes')).toBe('off');
    expect(pushFlag(' ON ')).toBe('on');
    expect(pushFlag('admin')).toBe('admin');
  });
  it('gates by role', () => {
    expect(pushEnabledFor(false, 'off')).toBe(false);
    expect(pushEnabledFor(true, 'off')).toBe(false);
    expect(pushEnabledFor(false, 'admin')).toBe(false);
    expect(pushEnabledFor(true, 'admin')).toBe(true);
    expect(pushEnabledFor(false, 'on')).toBe(true);
  });
});
