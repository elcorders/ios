import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { detectPlatform, isStandalone } from './pwa';

export type PushSupport = 'unsupported' | 'needs_install' | 'denied' | 'default' | 'granted';

const vapidKey = (): string => (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export function urlBase64ToUint8Array(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  if (!vapidKey()) return 'unsupported';
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  // iOS only delivers push to the installed app (Safari tabs have no PushManager).
  if ((platform === 'ios-safari' || platform === 'ios-other') && !isStandalone()) return 'needs_install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as 'denied' | 'default' | 'granted';
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export type EnableResult = { ok: true } | { ok: false; reason: 'unsupported' | 'denied' | 'failed' };

export async function enablePush(): Promise<EnableResult> {
  const support = pushSupport();
  if (support === 'unsupported' || support === 'needs_install') return { ok: false, reason: 'unsupported' };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey()) }));
    const p256dh = bufferToBase64Url(sub.getKey('p256dh'));
    const auth = bufferToBase64Url(sub.getKey('auth'));
    const res = await api.savePushSubscription({
      endpoint: sub.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 300),
    });
    return res.ok ? { ok: true } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  await api.deletePushSubscription(endpoint);
}

export interface PushState {
  support: PushSupport;
  /** null while checking */
  subscribed: boolean | null;
  busy: boolean;
  error: string | null;
  enable: () => Promise<boolean>;
}

export function usePushState(): PushState {
  const [support, setSupport] = useState<PushSupport>(() => pushSupport());
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (support === 'unsupported' || support === 'needs_install') return;
    void currentSubscription().then((s) => live && setSubscribed(s !== null));
    return () => {
      live = false;
    };
  }, [support]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await enablePush();
    setSupport(pushSupport());
    setBusy(false);
    if (r.ok) {
      setSubscribed(true);
      return true;
    }
    if (r.reason === 'failed') setError('Could not turn on notifications. Please try again.');
    return false;
  }, []);

  const unavailable = support === 'unsupported' || support === 'needs_install';
  return { support, subscribed: unavailable ? false : subscribed, busy, error, enable };
}
