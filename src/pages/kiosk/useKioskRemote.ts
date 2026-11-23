import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { KioskChannel, KioskCommand, KioskFeed, KioskMenuItem, KioskRemoteState, KioskScroll } from '../../api/types';
import { sendToBridge } from '../../lib/kioskBridge';
import {
  LEASE_RECHECK_MS, POINTER_HIDE_MS, UNKNOWN_LEASE_RECHECK_MS, isBridgeCommand, parseCommandMessage, throttle,
  type BridgeUp,
} from '../../lib/kioskRemote';

/** Laser dot position in CSS pixels of the kiosk viewport. */
export interface RemotePointer { x: number; y: number; at: number }
interface Lease { id: string; controller_name: string }

const TOP: KioskScroll = { anchor: null, offset: 0, fraction: 0 };

export function menuOf(feed: KioskFeed | null): KioskMenuItem[] {
  if (!feed) return [];
  const { resources, tutorials, materials } = feed.content;
  return [...tutorials, ...materials, ...resources].map(({ id, kind, title }) => ({ id, kind, title }));
}

/**
 * The board scrolls inside `.kiosk-main` on a big screen (the board is one screen high) and the whole
 * window on a small one; use whichever actually scrolls.
 */
function boardScroller(): { el: HTMLElement | null; top: number; max: number } {
  const main = document.querySelector<HTMLElement>('.kiosk-board .kiosk-main');
  if (main && main.scrollHeight - main.clientHeight > 1) return { el: main, top: main.scrollTop, max: main.scrollHeight - main.clientHeight };
  return { el: null, top: window.scrollY, max: Math.max(0, document.documentElement.scrollHeight - window.innerHeight) };
}

function windowScroll(): KioskScroll {
  const { top, max } = boardScroller();
  return { anchor: null, offset: 0, fraction: max > 0 ? Math.min(1, Math.max(0, top / max)) : 0 };
}

function scrollBoard(fraction: number): void {
  const { el, max } = boardScroller();
  const y = Math.round(fraction * max);
  if (el) el.scrollTop = y;
  else window.scrollTo(0, y);
}

/**
 * Kiosk side of the S23 remote (CONTRACT §S23): joins `kiosk:<device>`, obeys commands only under the active
 * lease (checked with `kioskCurrentControl`), replays content commands through the bridge, reports state.
 */
export function useKioskRemote({ deviceId, ready, itemId, feed }: { deviceId: string | null; ready: boolean; itemId: string | null; feed: KioskFeed | null }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [lease, setLease] = useState<Lease | null>(null);
  const [zoom, setZoom] = useState(1);
  const [blank, setBlank] = useState(false);
  const [pointer, setPointer] = useState<RemotePointer | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // Latest values for the channel callbacks (which are set up once per device).
  const live = useRef({ lease, zoom, blank, itemId, feed, search, scroll: TOP, ackSeq: null as number | null, frameReady: false });
  useEffect(() => {
    Object.assign(live.current, { lease, zoom, blank, itemId, feed, search });
  });
  const channel = useRef<KioskChannel | null>(null);
  const lastCheck = useRef(0);
  const askedFor = useRef(new Set<string>());
  const pendingBridge = useRef<KioskCommand[]>([]);

  const buildState = useCallback((withMenu: boolean): KioskRemoteState => {
    const l = live.current;
    const menu = menuOf(l.feed);
    const s: KioskRemoteState = {
      v: 1, device_id: deviceId ?? '', lease_id: l.lease?.id ?? null, controller_name: l.lease?.controller_name ?? null,
      ack_seq: l.ackSeq, view: l.itemId ? 'item' : 'home', item_id: l.itemId,
      item_title: l.itemId ? menu.find((m) => m.id === l.itemId)?.title ?? null : null,
      scroll: l.itemId ? l.scroll : windowScroll(), zoom: l.zoom, blank: l.blank,
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
    if (withMenu) s.menu = menu;
    return s;
  }, [deviceId]);

  const sendStateNow = useCallback((withMenu = false) => {
    channel.current?.send('state', buildState(withMenu));
  }, [buildState]);
  // Throttled state (10 / s), created in an effect so nothing ref-related runs during render.
  const throttled = useRef<ReturnType<typeof throttle<[]>> | null>(null);
  useEffect(() => {
    const t = throttle(() => sendStateNow(false), 100);
    throttled.current = t;
    return () => t.cancel();
  }, [sendStateNow]);
  const sendState = useCallback(() => throttled.current?.(), []);

  const endControl = useCallback(() => {
    setLease(null);
    setZoom(1);
    setBlank(false);
    setPointer(null);
  }, []);

  /** Ask the server who holds the lease (throttled for unknown lease ids). */
  const checkLease = useCallback(async (force: boolean, leaseId?: string): Promise<Lease | null> => {
    const now = Date.now();
    // A lease id we have not asked about yet is checked at once; a repeated unknown one at most every 5 s.
    const fresh = leaseId !== undefined && !askedFor.current.has(leaseId);
    if (!force && !fresh && now - lastCheck.current < UNKNOWN_LEASE_RECHECK_MS) return live.current.lease;
    if (leaseId) askedFor.current.add(leaseId);
    if (askedFor.current.size > 100) askedFor.current.clear();
    lastCheck.current = now;
    const r = await api.kioskCurrentControl();
    if (!r.ok) return live.current.lease;
    const l = r.data.lease ? { id: r.data.lease.id, controller_name: r.data.lease.controller_name } : null;
    if (!l) endControl();
    else if (l.id !== live.current.lease?.id) {
      // A new controller (take-over): start from a clean screen.
      setZoom(1);
      setBlank(false);
      setPointer(null);
      setLease(l);
    }
    live.current.lease = l;
    return l;
  }, [endControl]);

  const apply = useCallback((cmd: KioskCommand) => {
    const l = live.current;
    switch (cmd.type) {
      case 'hello':
        sendStateNow(true);
        return;
      case 'navigate': {
        const pathname = cmd.view === 'home' ? '/kiosk' : `/kiosk/c/${cmd.item_id}`;
        if ((cmd.view === 'home' && !l.itemId) || (cmd.view === 'item' && l.itemId === cmd.item_id)) break;
        l.scroll = TOP;
        l.frameReady = false;
        navigate({ pathname, search: l.search });
        window.scrollTo(0, 0);
        break;
      }
      case 'zoom':
        setZoom(cmd.level);
        l.zoom = cmd.level;
        break;
      case 'blank':
        setBlank(cmd.on);
        l.blank = cmd.on;
        break;
      case 'pointer':
        if (!cmd.visible) setPointer(null);
        else {
          // Relative to the content area: the frame on an item, the whole screen on the board.
          const r = document.querySelector('.viewer-frame')?.getBoundingClientRect();
          const box = r && r.width > 0 ? r : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
          setPointer({ x: box.left + cmd.x * box.width, y: box.top + cmd.y * box.height, at: Date.now() });
        }
        return;
      case 'reload':
        window.location.reload();
        return;
      case 'release':
        endControl();
        void checkLease(true);
        return;
      default:
        if (!isBridgeCommand(cmd)) return;
        if (!l.itemId) {
          if (cmd.type === 'scroll') scrollBoard(cmd.fraction);
        } else if (l.frameReady) {
          sendToBridge(frameRef.current, cmd);
          if (cmd.type === 'scroll') l.scroll = { anchor: cmd.anchor, offset: cmd.offset, fraction: cmd.fraction };
        } else {
          pendingBridge.current.push(cmd);
        }
    }
    sendState();
  }, [checkLease, endControl, navigate, sendStateNow, sendState]);

  // The channel lives as long as the signed-in device; handlers are reached through a ref so that
  // navigation (a new `navigate`) does not drop and re-join the channel.
  const handlers = useRef({ apply, checkLease, sendStateNow });
  useEffect(() => {
    handlers.current = { apply, checkLease, sendStateNow };
  }, [apply, checkLease, sendStateNow]);

  useEffect(() => {
    if (!ready || !deviceId) return;
    let closed = false;
    let off: (() => void) | null = null;
    void api.kioskRemoteChannel(deviceId, 'kiosk').then((r) => {
      if (!r.ok) return;
      if (closed) {
        r.data.close();
        return;
      }
      channel.current = r.data;
      off = r.data.on('cmd', (raw) => {
        const m = parseCommandMessage(raw);
        if (!m) return;
        const run = (l: Lease | null) => {
          if (!l || l.id !== m.lease_id) {
            if (m.cmd.type === 'hello') handlers.current.sendStateNow(true); // let a would-be controller see the screen
            return;
          }
          live.current.ackSeq = m.seq;
          handlers.current.apply(m.cmd);
        };
        const cur = live.current.lease;
        if (cur && cur.id === m.lease_id) run(cur);
        else void handlers.current.checkLease(false, m.lease_id).then(run);
      });
      void handlers.current.checkLease(true);
    });
    return () => {
      closed = true;
      off?.();
      channel.current?.close();
      channel.current = null;
    };
  }, [ready, deviceId]);

  // While controlled: re-check the lease (expiry, take-over, revoke) and send a state beat.
  useEffect(() => {
    if (!lease) return;
    const t = window.setInterval(() => {
      void checkLease(true);
      sendStateNow(false);
    }, LEASE_RECHECK_MS);
    return () => window.clearInterval(t);
  }, [lease, checkLease, sendStateNow]);

  // Local touches on the board / route changes are state too.
  useEffect(() => {
    if (!lease) return;
    const onScroll = () => sendState();
    // Capture: the board's own box scrolls too (scroll events do not bubble). Content frames report via the bridge.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, [lease, sendState]);
  useEffect(() => {
    if (lease) sendStateNow(false);
  }, [itemId, lease, zoom, blank, sendStateNow]);

  // Hide the laser dot a few seconds after the last move.
  useEffect(() => {
    if (!pointer) return;
    const t = window.setTimeout(() => setPointer(null), POINTER_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [pointer]);

  /** Messages from the bridge inside the kiosk's content frame. */
  const onBridge = useCallback((m: BridgeUp) => {
    const l = live.current;
    if (m.ev === 'ready') {
      l.frameReady = true;
      const queued = pendingBridge.current.splice(0);
      for (const c of queued) if (isBridgeCommand(c)) sendToBridge(frameRef.current, c);
      return;
    }
    if (m.ev === 'scroll') {
      l.scroll = { anchor: m.anchor, offset: m.offset, fraction: m.fraction };
      if (l.lease) sendState();
    }
  }, [sendState]);

  return { lease, zoom, blank, pointer, frameRef, onBridge };
}
