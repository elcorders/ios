import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { KioskFeed } from '../../api/types';
import { nextBoundary } from '../../lib/kiosk';
import {
  forget, getOrCreateRecord, kioskCryptoAvailable, sign, updateRecord, type KioskRecord,
} from '../../lib/kioskKey';

export type KioskPhase = 'init' | 'insecure' | 'pairing' | 'connecting' | 'ready';

const MINUTE = 60_000;
const RETRY_MS = 10_000;
const isMock = import.meta.env.VITE_API !== 'supabase';

/**
 * The kiosk device life cycle: key → pairing → sign-in → board. Keeps its own memory-only session
 * (refreshed 5 min before it ends), polls the feed every minute and at slot boundaries, and sends heartbeats.
 */
export function useKiosk() {
  const [phase, setPhase] = useState<KioskPhase>('init');
  const [record, setRecord] = useState<KioskRecord | null>(null);
  const [feed, setFeed] = useState<KioskFeed | null>(null);
  const [online, setOnline] = useState(true);
  const [skew, setSkew] = useState(0);
  const alive = useRef(true);
  const deviceId = useRef<string | null>(null);
  const refreshTimer = useRef<number | undefined>(undefined);

  const toPairing = useCallback(async () => {
    window.clearTimeout(refreshTimer.current);
    deviceId.current = null;
    setFeed(null);
    await api.kioskSignOut();
    await forget().catch(() => undefined);
    const rec = await getOrCreateRecord();
    if (!alive.current) return;
    setRecord(rec);
    setPhase('pairing');
  }, []);

  /** Sign in (retrying while the network is down). `invalid_device` forgets the key. */
  const signIn = useCallback(async (id: string): Promise<boolean> => {
    deviceId.current = id;
    for (;;) {
      const r = await api.kioskSignIn(id, sign);
      if (!alive.current) return false;
      if (r.ok) {
        const wait = Math.max(5_000, Date.parse(r.data.expires_at) - 5 * MINUTE - Date.now());
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => void signIn(id), Math.min(wait, 2 ** 31 - 1));
        setPhase('ready');
        setOnline(true);
        return true;
      }
      if (r.error.code === 'invalid_device') {
        await toPairing();
        return false;
      }
      setPhase((p) => (p === 'ready' ? p : 'connecting'));
      setOnline(false);
      await new Promise((res) => window.setTimeout(res, RETRY_MS));
      if (!alive.current) return false;
    }
  }, [toPairing]);

  // Boot.
  useEffect(() => {
    alive.current = true;
    void (async () => {
      if (!kioskCryptoAvailable()) {
        setPhase('insecure');
        return;
      }
      try {
        if (isMock && /[?&]reset=1/.test(location.hash)) await forget();
        const rec = await getOrCreateRecord();
        if (!alive.current) return;
        setRecord(rec);
        if (rec.device_id) {
          setPhase('connecting');
          await signIn(rec.device_id);
        } else setPhase('pairing');
      } catch {
        if (alive.current) setPhase('insecure');
      }
    })();
    return () => {
      alive.current = false;
      window.clearTimeout(refreshTimer.current);
    };
  }, [signIn]);

  /** Pairing approved on the staff's phone. */
  const approved = useCallback(async (id: string) => {
    const rec = await updateRecord({ device_id: id, pairing_id: null });
    setRecord(rec);
    setPhase('connecting');
    await signIn(id);
  }, [signIn]);

  const loadFeed = useCallback(async () => {
    let r = await api.kioskFeed();
    if (!r.ok && r.error.code === 'forbidden' && deviceId.current) {
      if (await signIn(deviceId.current)) r = await api.kioskFeed();
    }
    if (!alive.current) return;
    if (r.ok) {
      setFeed(r.data);
      setSkew(Date.parse(r.data.now) - Date.now());
      setOnline(true);
    } else setOnline(false);
  }, [signIn]);

  // Feed: now, every minute, and at the next slot boundary.
  const boundaryKey = feed ? nextBoundary(feed, Date.now() + skew) : null;
  useEffect(() => {
    if (phase !== 'ready') return;
    void loadFeed();
    const t = window.setInterval(() => void loadFeed(), MINUTE);
    const h = window.setInterval(() => void api.kioskHeartbeat(), MINUTE);
    void api.kioskHeartbeat();
    return () => {
      window.clearInterval(t);
      window.clearInterval(h);
    };
  }, [phase, loadFeed]);
  // Typing a new ?demo= in the address bar only changes the hash: reload the feed.
  useEffect(() => {
    if (phase !== 'ready') return;
    const onHash = () => void loadFeed();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [phase, loadFeed]);
  useEffect(() => {
    if (phase !== 'ready' || boundaryKey === null) return;
    const wait = boundaryKey - (Date.now() + skew) + 1_000;
    const t = window.setTimeout(() => void loadFeed(), Math.min(Math.max(wait, 1_000), 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [phase, boundaryKey, skew, loadFeed]);

  return { phase, record, feed, online, skew, approved, restartPairing: toPairing };
}

/** Wall clock (ms), corrected by the server skew, refreshed every few seconds. */
export function useNow(skew: number, every = 5_000): number {
  // Raw clock in state; the skew is added on render so a new skew shows at once.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), every);
    return () => window.clearInterval(t);
  }, [every]);
  return tick + skew;
}

/** Keep the screen on while `active`; re-acquired when the tab becomes visible again. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!active || !wl) return;
    let sentinel: { release(): Promise<void> } | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const s = await wl.request('screen');
        if (stopped) void s.release();
        else sentinel = s;
      } catch {
        /* denied or unsupported: the screen may sleep, nothing else to do */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

