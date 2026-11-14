import type { KioskCommand, KioskCommandMessage, KioskMenuItem, KioskRemoteState, KioskScroll } from '../api/types';

/**
 * S23 kiosk remote (CONTRACT §S23): validation of everything that arrives over Realtime or postMessage.
 * Payloads are untrusted, so each parser returns a clean copy or null.
 */

export const LEASE_HEARTBEAT_MS = 20_000;
export const LEASE_RECHECK_MS = 20_000;
export const UNKNOWN_LEASE_RECHECK_MS = 5_000;
export const POINTER_HIDE_MS = 3_000;
export const THROTTLE_MS = 50; // 20 / s
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
const MAX_VALUE = 2000;
const MAX_PATH = 500;
const PATH_RE = /^[A-Za-z0-9#_:().>\- ]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isUnit = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
export const isUuid = (x: unknown): x is string => typeof x === 'string' && UUID_RE.test(x);
/** Content ids: uuids from the database; the mock uses short slugs ("content-t1"). Safe for a route segment. */
const isItemId = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(x);
export const isCssPath = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_PATH && PATH_RE.test(x);
const isValue = (x: unknown): x is string => typeof x === 'string' && x.length <= MAX_VALUE;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

export function parseScroll(x: unknown): KioskScroll | null {
  if (!isObj(x)) return null;
  const anchor = x['anchor'] === null || x['anchor'] === undefined ? null : x['anchor'];
  if (anchor !== null && !isCssPath(anchor)) return null;
  if (!isUnit(x['offset']) || !isUnit(x['fraction'])) return null;
  return { anchor, offset: x['offset'], fraction: x['fraction'] };
}

export function parseCommand(x: unknown): KioskCommand | null {
  if (!isObj(x)) return null;
  switch (x['type']) {
    case 'hello':
    case 'reload':
    case 'release':
      return { type: x['type'] };
    case 'navigate':
      if (x['view'] === 'home') return { type: 'navigate', view: 'home' };
      if (x['view'] === 'item' && isItemId(x['item_id'])) return { type: 'navigate', view: 'item', item_id: x['item_id'] };
      return null;
    case 'scroll': {
      const s = parseScroll(x);
      return s ? { type: 'scroll', ...s } : null;
    }
    case 'click':
      return isCssPath(x['path']) && isUnit(x['x']) && isUnit(x['y']) ? { type: 'click', path: x['path'], x: x['x'], y: x['y'] } : null;
    case 'input':
      return isCssPath(x['path']) && isValue(x['value']) ? { type: 'input', path: x['path'], value: x['value'] } : null;
    case 'toggle':
      return isCssPath(x['path']) && isBool(x['open']) ? { type: 'toggle', path: x['path'], open: x['open'] } : null;
    case 'tap':
      return isUnit(x['x']) && isUnit(x['y']) ? { type: 'tap', x: x['x'], y: x['y'] } : null;
    case 'pointer':
      return isUnit(x['x']) && isUnit(x['y']) && isBool(x['visible']) ? { type: 'pointer', x: x['x'], y: x['y'], visible: x['visible'] } : null;
    case 'zoom':
      return typeof x['level'] === 'number' && x['level'] >= ZOOM_MIN && x['level'] <= ZOOM_MAX ? { type: 'zoom', level: x['level'] } : null;
    case 'blank':
      return isBool(x['on']) ? { type: 'blank', on: x['on'] } : null;
    default:
      return null;
  }
}

export function parseCommandMessage(x: unknown): KioskCommandMessage | null {
  if (!isObj(x) || x['v'] !== 1 || !isUuid(x['lease_id'])) return null;
  const seq = x['seq'];
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) return null;
  const cmd = parseCommand(x['cmd']);
  return cmd ? { v: 1, lease_id: x['lease_id'], seq, cmd } : null;
}

const KINDS = new Set(['resource', 'tutorial', 'material']);
function parseMenu(x: unknown): KioskMenuItem[] | undefined | null {
  if (x === undefined) return undefined;
  if (!Array.isArray(x) || x.length > 300) return null;
  const out: KioskMenuItem[] = [];
  for (const m of x) {
    if (!isObj(m) || !isItemId(m['id']) || !KINDS.has(m['kind'] as string) || typeof m['title'] !== 'string') return null;
    out.push({ id: m['id'], kind: m['kind'] as KioskMenuItem['kind'], title: m['title'].slice(0, 200) });
  }
  return out;
}

export function parseRemoteState(x: unknown): KioskRemoteState | null {
  if (!isObj(x) || x['v'] !== 1 || !isUuid(x['device_id'])) return null;
  const lease = x['lease_id'] ?? null;
  if (lease !== null && !isUuid(lease)) return null;
  const name = x['controller_name'] ?? null;
  if (name !== null && typeof name !== 'string') return null;
  const ack = x['ack_seq'] ?? null;
  if (ack !== null && (typeof ack !== 'number' || !Number.isInteger(ack))) return null;
  const view = x['view'];
  if (view !== 'home' && view !== 'item') return null;
  const item = x['item_id'] ?? null;
  if (item !== null && !isItemId(item)) return null;
  const title = x['item_title'] ?? null;
  if (title !== null && typeof title !== 'string') return null;
  const scroll = parseScroll(x['scroll']);
  if (!scroll) return null;
  const zoom = x['zoom'];
  if (typeof zoom !== 'number' || zoom < ZOOM_MIN || zoom > ZOOM_MAX) return null;
  if (!isBool(x['blank'])) return null;
  const vp = x['viewport'];
  if (!isObj(vp) || typeof vp['w'] !== 'number' || typeof vp['h'] !== 'number') return null;
  const menu = parseMenu(x['menu']);
  if (menu === null) return null;
  const out: KioskRemoteState = {
    v: 1, device_id: x['device_id'], lease_id: lease, controller_name: name ? name.slice(0, 80) : null, ack_seq: ack,
    view, item_id: item, item_title: title ? title.slice(0, 200) : null, scroll, zoom, blank: x['blank'],
    viewport: { w: vp['w'], h: vp['h'] },
  };
  if (menu) out.menu = menu;
  return out;
}

/** Messages from the bridge script inside a content iframe (CONTRACT §S23 Bridge). */
export type BridgeUp =
  | { ev: 'ready'; w: number; h: number }
  | ({ ev: 'scroll' } & KioskScroll)
  | { ev: 'click'; path: string; x: number; y: number }
  | { ev: 'input'; path: string; value: string }
  | { ev: 'toggle'; path: string; open: boolean };

export function parseBridgeUp(x: unknown): BridgeUp | null {
  if (!isObj(x) || x['type'] !== 'ios-bridge' || x['dir'] !== 'up') return null;
  switch (x['ev']) {
    case 'ready':
      return typeof x['w'] === 'number' && typeof x['h'] === 'number' ? { ev: 'ready', w: x['w'], h: x['h'] } : null;
    case 'scroll': {
      const s = parseScroll(x);
      return s ? { ev: 'scroll', ...s } : null;
    }
    case 'click':
      return isCssPath(x['path']) && isUnit(x['x']) && isUnit(x['y']) ? { ev: 'click', path: x['path'], x: x['x'], y: x['y'] } : null;
    case 'input':
      return isCssPath(x['path']) && isValue(x['value']) ? { ev: 'input', path: x['path'], value: x['value'] } : null;
    case 'toggle':
      return isCssPath(x['path']) && isBool(x['open']) ? { ev: 'toggle', path: x['path'], open: x['open'] } : null;
    default:
      return null;
  }
}

/** Commands the bridge replays inside the iframe. */
export type BridgeDownCommand = Extract<KioskCommand, { type: 'scroll' | 'click' | 'input' | 'toggle' | 'tap' }>;
export const isBridgeCommand = (c: KioskCommand): c is BridgeDownCommand =>
  c.type === 'scroll' || c.type === 'click' || c.type === 'input' || c.type === 'toggle' || c.type === 'tap';

/** Leading + trailing throttle: at most one call per `ms`, the last call always delivered. */
export function throttle<A extends unknown[]>(fn: (...a: A) => void, ms = THROTTLE_MS): ((...a: A) => void) & { cancel(): void } {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | null = null;
  const run = (...a: A) => {
    const now = Date.now();
    const wait = last + ms - now;
    if (wait <= 0) {
      last = now;
      fn(...a);
      return;
    }
    pending = a;
    if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        last = Date.now();
        if (pending) fn(...pending);
        pending = null;
      }, wait);
    }
  };
  run.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = null;
  };
  return run;
}
