import type { RealtimeChannel } from '@supabase/supabase-js';
import type { KioskChannel, KioskControl, Result, S23Api } from '../types';
import { fail, internalError, ok } from './errors';
import { getSupabase, type Supabase } from './client';
import { callRpc } from './rpc';
import { currentKioskDevice, getKiosk, kioskRpc } from './kiosk';

/** How long to wait for Realtime to accept the join (policies are checked then). */
const JOIN_TIMEOUT_MS = 10_000;

type Cb = (p: unknown) => void;
interface Shared {
  ch: RealtimeChannel;
  joined: Promise<string>;
  refs: number;
  listeners: { cmd: Set<Cb>; state: Set<Cb> };
  /** Forget the entry and remove the channel. */
  drop: () => void;
}
/**
 * supabase-js returns the same channel object for the same topic, so two handles (React dev runs effects twice,
 * or a re-join while the old handle closes) share one subscription. Close the channel only with the last handle.
 */
const shared = new Map<string, Shared>();

function acquire(sb: Supabase, topic: string): Shared {
  const key = `${sb === getSupabase() ? 'person' : 'kiosk'}|${topic}`;
  let s = shared.get(key);
  if (!s) {
    const ch: RealtimeChannel = sb.channel(topic, { config: { private: true, broadcast: { self: false, ack: false } } });
    const listeners = { cmd: new Set<Cb>(), state: new Set<Cb>() };
    for (const ev of ['cmd', 'state'] as const) {
      ch.on('broadcast', { event: ev }, (msg: { payload?: unknown }) => {
        for (const cb of listeners[ev]) cb(msg.payload);
      });
    }
    const joined = sb.realtime.setAuth().then(() => new Promise<string>((resolve) => {
      const t = window.setTimeout(() => resolve('TIMED_OUT'), JOIN_TIMEOUT_MS);
      ch.subscribe((st) => {
        if (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          window.clearTimeout(t);
          resolve(st);
        }
      });
    }));
    const entry: Shared = {
      ch, joined, refs: 0, listeners,
      drop: () => {
        if (shared.get(key) === entry) shared.delete(key);
        void sb.removeChannel(ch);
      },
    };
    s = entry;
    shared.set(key, entry);
    // A refused join is forgotten at once, so the next attempt starts a fresh channel.
    void joined.then((st) => { if (st !== 'SUBSCRIBED') entry.drop(); }, entry.drop);
  }
  s.refs += 1;
  return s;
}

/**
 * Join the private broadcast channel `kiosk:<deviceId>` (CONTRACT §S23). Realtime checks the
 * `realtime.messages` policies at join, so a refused join is `forbidden`. Payloads are passed on unvalidated.
 */
async function join(sb: Supabase, deviceId: string): Promise<Result<KioskChannel>> {
  try {
    const s = acquire(sb, `kiosk:${deviceId}`);
    const status = await s.joined;
    const release = () => {
      s.refs -= 1;
      if (s.refs <= 0) s.drop();
    };
    if (status !== 'SUBSCRIBED') {
      release();
      return status === 'CHANNEL_ERROR' ? fail('forbidden', 'Not allowed to join this kiosk channel.') : internalError();
    }
    const mine = { cmd: new Set<Cb>(), state: new Set<Cb>() };
    let closed = false;
    const channel = {
      send(event: 'cmd' | 'state', payload: unknown) {
        if (!closed) void s.ch.send({ type: 'broadcast', event, payload });
      },
      on(event: 'cmd' | 'state', cb: Cb) {
        mine[event].add(cb);
        s.listeners[event].add(cb);
        return () => {
          mine[event].delete(cb);
          s.listeners[event].delete(cb);
        };
      },
      close() {
        if (closed) return;
        closed = true;
        for (const ev of ['cmd', 'state'] as const) for (const cb of mine[ev]) s.listeners[ev].delete(cb);
        release();
      },
    } as KioskChannel;
    return ok(channel);
  } catch {
    return internalError();
  }
}

export const kioskRemoteMethods: S23Api = {
  kioskControlStart: (deviceId, takeOver) =>
    callRpc<KioskControl>('kiosk_control_start', { p_device_id: deviceId, p_take_over: takeOver }),
  kioskControlHeartbeat: (id) => callRpc<KioskControl>('kiosk_control_heartbeat', { p_id: id }),
  kioskControlEnd: (id) => callRpc('kiosk_control_end', { p_id: id }),
  kioskControlState: (deviceId) => callRpc('kiosk_control_state', { p_device_id: deviceId }),

  async kioskCurrentControl() {
    const id = currentKioskDevice();
    if (!id) return fail('forbidden', 'This screen needs to sign in again.');
    return kioskRpc('kiosk_control_state', { p_device_id: id });
  },

  kioskRemoteChannel: (deviceId, side) => join(side === 'kiosk' ? getKiosk() : getSupabase(), deviceId),
};
