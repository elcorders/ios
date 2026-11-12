import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bufferToBase64Url, currentSubscription, disablePush, enablePush, pushSupport, urlBase64ToUint8Array } from './push';
import { api } from '../api';
import { resetMockAuth } from '../api/mock/auth';
import { resetMockPush } from '../api/mock/push';

const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function bytes(...n: number[]): ArrayBuffer {
  return new Uint8Array(n).buffer;
}

function setup(permission: NotificationPermission = 'default') {
  const sub = {
    endpoint: 'https://push.example.test/abc',
    getKey: (n: string) => (n === 'p256dh' ? bytes(251, 255, 254) : bytes(1, 2, 3)),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  let current: typeof sub | null = null;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => (current = sub)),
  };
  vi.stubGlobal('Notification', { permission, requestPermission: vi.fn(async () => permission === 'default' ? 'granted' : permission) });
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true });
  return { pushManager, sub };
}

beforeEach(() => {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  resetMockAuth();
  resetMockPush();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('encoding helpers', () => {
  it('decodes base64url and encodes buffers', () => {
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
    expect(bufferToBase64Url(bytes(251, 255, 254))).toBe('-__-');
    expect(bufferToBase64Url(null)).toBe('');
  });
});

describe('pushSupport', () => {
  it('is unsupported without the public key', () => {
    setup();
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(pushSupport()).toBe('unsupported');
  });
  it('is unsupported without Notification', () => {
    setup();
    vi.stubGlobal('Notification', undefined);
    expect(pushSupport()).toBe('unsupported');
  });
  it('reports the permission state', () => {
    setup('default');
    expect(pushSupport()).toBe('default');
    setup('denied');
    expect(pushSupport()).toBe('denied');
    setup('granted');
    expect(pushSupport()).toBe('granted');
  });
  it('needs install on iOS outside the app', () => {
    setup();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    expect(pushSupport()).toBe('needs_install');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(pushSupport()).toBe('default');
    vi.restoreAllMocks();
  });
});

describe('enable / disable', () => {
  it('subscribes and saves the subscription', async () => {
    const { pushManager } = setup();
    await api.verifyEmailCode('student005@example.edu', '123456');
    expect(await enablePush()).toEqual({ ok: true });
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect((await api.getMyPush())).toEqual({ ok: true, data: { devices: 1 } });
    expect(await currentSubscription()).not.toBeNull();
  });
  it('reports denied permission', async () => {
    setup('default');
    (Notification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue('denied');
    await api.verifyEmailCode('student005@example.edu', '123456');
    expect(await enablePush()).toEqual({ ok: false, reason: 'denied' });
  });
  it('unsubscribes and deletes', async () => {
    const { sub } = setup();
    await api.verifyEmailCode('student005@example.edu', '123456');
    await enablePush();
    await disablePush();
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(await api.getMyPush()).toEqual({ ok: true, data: { devices: 0 } });
  });
});
