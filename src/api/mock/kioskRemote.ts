import type { ApiError, IsoDateTime, KioskChannel, KioskControl, Result, S23Api, Uuid } from '../types';
import { getMockCurrentEmail } from './auth';
import { MOCK_USERS } from './fixtures/s1';

/**
 * S23 mock (CONTRACT §S23). For a demo with two tabs on one PC:
 * - leases live in localStorage, so the controller tab and the kiosk tab see the same lease;
 * - the channel is a BroadcastChannel between tabs.
 * Each tab's mock kiosk has its own device id (S21 mock state is per tab), so the **mock kiosk answers for
 * every device**: it obeys commands on any `kiosk:<id>` topic and replies on the topic it last heard from.
 * Supabase (S23.I) uses the real per-device private channel.
 */

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(code: string, details?: unknown): Result<T> => ({ ok: false, error: { code, message: code, details } satisfies ApiError });

const LEASE_MS = 60_000;
const STORE = 'nibm-mock-kiosk-leases';
const BC_NAME = 'nibm-mock-kiosk-remote';

interface MockLease {
  id: Uuid;
  device_id: Uuid;
  controller_id: Uuid;
  controller_name: string;
  started: number;
  hb: number;
  ended: number | null;
  end_reason: 'released' | 'taken_over' | 'expired' | 'revoked' | null;
  taken_over_by_name: string | null;
}

let memory: MockLease[] = [];
function load(): MockLease[] {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as MockLease[]) : memory;
  } catch {
    return memory;
  }
}
function save(rows: MockLease[]): void {
  memory = rows.slice(-50);
  try {
    localStorage.setItem(STORE, JSON.stringify(memory));
  } catch {
    /* private mode: memory only */
  }
}

/** Test helper. */
export function resetMockKioskRemote(): void {
  memory = [];
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
}

const iso = (ms: number): IsoDateTime => `${new Date(ms + 19_800_000).toISOString().slice(0, 19)}+05:30`;
const newId = () => crypto.randomUUID();
const me = () => MOCK_USERS.find((u) => u.profile.email === getMockCurrentEmail()) ?? null;
const nameOf = (u: NonNullable<ReturnType<typeof me>>) => `${u.profile.first_name} ${u.profile.last_name.slice(0, 1)}.`;
const active = (l: MockLease, now: number) => l.ended === null && now - l.hb < LEASE_MS;

/** Lazy expiry (as the SQL does before every lease RPC). */
function expire(rows: MockLease[], now: number): MockLease[] {
  for (const l of rows) if (l.ended === null && now - l.hb >= LEASE_MS) Object.assign(l, { ended: now, end_reason: 'expired' });
  return rows;
}
const toControl = (l: MockLease): KioskControl => ({
  id: l.id, device_id: l.device_id, controller_id: l.controller_id, controller_name: l.controller_name,
  started_at: iso(l.started), last_heartbeat_at: iso(l.hb), expires_at: iso(l.hb + LEASE_MS),
});

// ───────────── channel ─────────────
interface Envelope { topic: string; event: 'cmd' | 'state'; payload: unknown }

function openChannel(deviceId: Uuid, side: 'kiosk' | 'controller'): KioskChannel {
  const own = `kiosk:${deviceId}`;
  let replyTopic = own;
  const bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(BC_NAME);
  const subs = { cmd: new Set<(p: unknown) => void>(), state: new Set<(p: unknown) => void>() };
  if (bc) {
    bc.onmessage = (e: MessageEvent) => {
      const env = e.data as Envelope | null;
      if (!env || typeof env.topic !== 'string' || !env.topic.startsWith('kiosk:')) return;
      if (side === 'kiosk') {
        if (env.event !== 'cmd') return;
        replyTopic = env.topic; // mock: answer for any device
      } else if (env.event !== 'state' || env.topic !== own) return;
      for (const cb of subs[env.event]) cb(env.payload);
    };
  }
  return {
    send(event: 'cmd' | 'state', payload: unknown) {
      bc?.postMessage({ topic: side === 'kiosk' ? replyTopic : own, event, payload } satisfies Envelope);
    },
    on(event: 'cmd' | 'state', cb: (p: unknown) => void) {
      subs[event].add(cb);
      return () => subs[event].delete(cb);
    },
    close() {
      subs.cmd.clear();
      subs.state.clear();
      bc?.close();
    },
  } as KioskChannel;
}

// ───────────── API ─────────────
export const mockKioskRemote: S23Api = {
  async kioskControlStart(deviceId, takeOver) {
    const u = me();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    const now = Date.now();
    const rows = expire(load(), now);
    const held = rows.find((l) => l.device_id === deviceId && active(l, now));
    if (held && !takeOver) {
      save(rows);
      return fail('controlled', { controller_name: held.controller_name, started_at: iso(held.started), self: held.controller_id === u.profile.id });
    }
    if (held) Object.assign(held, { ended: now, end_reason: 'taken_over', taken_over_by_name: nameOf(u) });
    const l: MockLease = {
      id: newId(), device_id: deviceId, controller_id: u.profile.id, controller_name: nameOf(u),
      started: now, hb: now, ended: null, end_reason: null, taken_over_by_name: null,
    };
    rows.push(l);
    save(rows);
    return ok(toControl(l));
  },

  async kioskControlHeartbeat(id) {
    const u = me();
    if (!u) return fail('not_authenticated');
    const now = Date.now();
    const rows = expire(load(), now);
    const l = rows.find((x) => x.id === id);
    if (!l) return fail('not_found');
    if (l.controller_id !== u.profile.id) return fail('forbidden');
    if (l.ended !== null) {
      save(rows);
      return fail('lease_ended', { end_reason: l.end_reason, taken_over_by_name: l.taken_over_by_name });
    }
    l.hb = now;
    save(rows);
    return ok(toControl(l));
  },

  async kioskControlEnd(id) {
    const u = me();
    if (!u) return fail('not_authenticated');
    const rows = load();
    const l = rows.find((x) => x.id === id);
    if (!l) return fail('not_found');
    if (l.controller_id !== u.profile.id) return fail('forbidden');
    if (l.ended === null) Object.assign(l, { ended: Date.now(), end_reason: 'released' });
    save(rows);
    return ok({ ok: true as const });
  },

  async kioskControlState(deviceId) {
    const u = me();
    if (!u) return fail('not_authenticated');
    if (!u.profile.is_admin) return fail('forbidden');
    const now = Date.now();
    const rows = expire(load(), now);
    save(rows);
    const l = rows.find((x) => x.device_id === deviceId && active(x, now));
    return ok({ lease: l ? toControl(l) : null });
  },

  async kioskCurrentControl() {
    // Mock: the kiosk answers for every device, so the newest active lease on any device counts.
    const now = Date.now();
    const rows = expire(load(), now);
    save(rows);
    const l = rows.filter((x) => active(x, now)).sort((a, b) => b.started - a.started)[0];
    return ok({ lease: l ? toControl(l) : null });
  },

  async kioskRemoteChannel(deviceId, side) {
    return ok(openChannel(deviceId, side));
  },
};
