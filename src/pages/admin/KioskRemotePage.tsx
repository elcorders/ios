import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import type { AdminContentItem, KioskDevice, KioskRemoteState } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ContentFrame } from '../../components/ContentFrame';
import { messageFor } from '../../lib/errors';
import { sendToBridge } from '../../lib/kioskBridge';
import { ZOOM_STEPS, throttle, type BridgeUp } from '../../lib/kioskRemote';
import { formatColombo } from '../../lib/time';
import { Dialog } from './Dialog';
import { useKioskController } from './kiosks/useKioskController';
import './kiosks/remote.css';

const KIND_LABEL = { tutorial: 'Tutorial', material: 'Class material', resource: 'Resource' } as const;

/** S23 Admin › Kiosks › <device> › Remote (CONTRACT §S23). Admin only (the backend enforces it too). */
export function KioskRemotePage() {
  const { me } = useAuth();
  const { id } = useParams();
  if (!me?.is_admin) {
    return (
      <section className="card">
        <h1>Not allowed</h1>
        <p>Only admins can control a kiosk.</p>
      </section>
    );
  }
  return id ? <Remote key={id} deviceId={id} /> : null;
}

function Remote({ deviceId }: { deviceId: string }) {
  const [device, setDevice] = useState<KioskDevice | null | undefined>(undefined);
  const c = useKioskController(deviceId);

  useEffect(() => {
    let live = true;
    const load = () =>
      void api.adminListKiosks().then((r) => {
        if (live && r.ok) setDevice(r.data.devices.find((d) => d.id === deviceId && !d.revoked_at) ?? null);
      });
    load();
    const t = window.setInterval(load, 30_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [deviceId]);

  const controlling = c.phase.step === 'controlling';
  const s = c.state;
  return (
    <section className="remote stack">
      <div className="remote-head">
        <Link to="/admin/kiosks">← Kiosks</Link>
        <h1>{device ? `Remote: ${device.name}` : 'Kiosk remote'}</h1>
        {device ? (
          <span className="kiosk-status">
            <span className={`kiosk-dot ${device.online ? 'on' : 'off'}`} aria-hidden="true" />
            {device.online ? 'Online' : device.last_seen_at ? `Offline · last seen ${formatColombo(device.last_seen_at, { hour: '2-digit', minute: '2-digit' })}` : 'Offline · never seen'}
          </span>
        ) : null}
      </div>
      {device === null ? <p role="alert" className="error">This kiosk was not found or has been revoked.</p> : null}
      {c.error ? <p role="alert" className="error">{c.error}</p> : null}

      {!controlling ? (
        <div className="card stack">
          {c.phase.step === 'ended' ? <p role="status">{c.phase.message}</p> : null}
          <p>Take control to open pages, scroll and click on this screen. Others see "Controlled by" you on the screen.</p>
          {device && !device.online ? <p className="muted">The screen looks offline, so it may not respond.</p> : null}
          <div className="row">
            <button type="button" className="primary" disabled={!device || c.phase.step === 'starting'} onClick={() => void c.start(false)}>
              {c.phase.step === 'starting' ? 'Starting…' : 'Take control'}
            </button>
          </div>
        </div>
      ) : (
        <Controls c={c} state={s} />
      )}

      {c.phase.step === 'confirm' ? (
        <Dialog title="Take over this screen?" submitLabel="Take over" onCancel={c.cancelConfirm} onSubmit={() => void c.start(true)}>
          <p>
            {c.phase.self
              ? 'You are already controlling this screen in another tab or device. Take over here?'
              : `${c.phase.holder} is controlling this screen. Take over from ${c.phase.holder}?`}
          </p>
        </Dialog>
      ) : null}
    </section>
  );
}

type Controller = ReturnType<typeof useKioskController>;

function Controls({ c, state }: { c: Controller; state: KioskRemoteState | null }) {
  const [pointerMode, setPointerMode] = useState(false);
  const zoom = state?.zoom ?? 1;
  const step = (dir: 1 | -1) => {
    const i = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))]!;
    c.send({ type: 'zoom', level: next });
  };
  const showing = !state ? 'Waiting for the screen…' : state.view === 'home' ? 'The board' : state.item_title ?? 'An item';

  return (
    <>
      <div className="remote-toolbar" role="toolbar" aria-label="Screen controls">
        <button type="button" onClick={() => c.send({ type: 'navigate', view: 'home' })} aria-pressed={state?.view === 'home'}>Home</button>
        <span className="remote-group" role="group" aria-label="Zoom">
          <button type="button" onClick={() => step(-1)} aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]}>−</button>
          <button type="button" onClick={() => c.send({ type: 'zoom', level: 1 })} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => step(1)} aria-label="Zoom in" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!}>+</button>
        </span>
        <button type="button" aria-pressed={!!state?.blank} onClick={() => c.send({ type: 'blank', on: !state?.blank })}>
          {state?.blank ? 'Show screen' : 'Blank'}
        </button>
        <button type="button" aria-pressed={pointerMode} onClick={() => setPointerMode((p) => !p)}>Pointer</button>
        <button type="button" onClick={() => c.send({ type: 'reload' })}>Reload</button>
        <span className="kiosk-spacer" />
        <button type="button" className="danger" onClick={() => void c.release()}>Release</button>
      </div>
      <p role="status" className="muted remote-showing">
        On screen: <strong>{showing}</strong>
        {state?.blank ? ' · blanked' : ''}
      </p>
      <div className="remote-body">
        <Stage c={c} state={state} pointerMode={pointerMode} />
        <aside className="card remote-menu" aria-label="Open on the screen">
          <h2>Open on the screen</h2>
          {c.menu.length === 0 ? <p className="muted">{state ? 'Nothing published for this screen yet.' : 'Waiting for the screen…'}</p> : null}
          <ul>
            {c.menu.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={state?.item_id === m.id ? 'active' : undefined}
                  aria-current={state?.item_id === m.id ? 'true' : undefined}
                  onClick={() => c.send({ type: 'navigate', view: 'item', item_id: m.id })}
                >
                  <strong>{m.title}</strong>
                  <span className="muted">{KIND_LABEL[m.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

/** The mirrored page: the same item in a bridged frame, or a scroll slider for the board. */
function Stage({ c, state, pointerMode }: { c: Controller; state: KioskRemoteState | null; pointerMode: boolean }) {
  const itemId = state?.view === 'item' ? state.item_id : null;
  const [item, setItem] = useState<{ id: string; data: AdminContentItem | null; error: string | null } | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const followed = useRef<string | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!itemId) return;
    let live = true;
    void api.adminGetContent(itemId).then((r) => {
      if (!live) return;
      setItem({ id: itemId, data: r.ok ? r.data : null, error: r.ok ? null : messageFor(r.error) });
    });
    return () => {
      live = false;
    };
  }, [itemId]);

  const { send } = c;
  const sendScroll = useMemo(() => throttle((m: Extract<BridgeUp, { ev: 'scroll' }>) => {
    send({ type: 'scroll', anchor: m.anchor, offset: m.offset, fraction: m.fraction });
  }), [send]);
  useEffect(() => () => sendScroll.cancel(), [sendScroll]);

  const onBridge = useCallback((m: BridgeUp) => {
    if (m.ev === 'ready') {
      // Join where the kiosk is (once per item); after that this page leads.
      const s = stateRef.current;
      if (s && s.item_id && followed.current !== s.item_id) {
        followed.current = s.item_id;
        sendToBridge(frameRef.current, { type: 'scroll', ...s.scroll });
      }
      return;
    }
    if (m.ev === 'scroll') sendScroll(m);
    else if (m.ev === 'click') send({ type: 'click', path: m.path, x: m.x, y: m.y });
    else if (m.ev === 'input') send({ type: 'input', path: m.path, value: m.value });
    else if (m.ev === 'toggle') send({ type: 'toggle', path: m.path, open: m.open });
  }, [send, sendScroll]);

  // Pointer mode: the overlay turns touches into a laser dot (move) and taps at the same point (click).
  const sendPointer = useMemo(() => throttle((x: number, y: number, visible: boolean) => send({ type: 'pointer', x, y, visible })), [send]);
  useEffect(() => () => sendPointer.cancel(), [sendPointer]);
  const rel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    return { x: clamp((e.clientX - r.left) / (r.width || 1)), y: clamp((e.clientY - r.top) / (r.height || 1)) };
  };

  const shown = itemId && item?.id === itemId ? item : null;
  return (
    <div className="remote-stage card">
      {!state ? <p role="status" className="muted remote-empty">Waiting for the screen to answer… Is it on and online?</p> : null}
      {state && state.view === 'home' ? (
        <div className="remote-board stack">
          <p><strong>The board</strong> is on the screen (class, lab today and content).</p>
          <label htmlFor="remote-board-scroll">Scroll the board</label>
          <input
            id="remote-board-scroll"
            type="range"
            min={0}
            max={100}
            value={Math.round(state.scroll.fraction * 100)}
            onChange={(e) => send({ type: 'scroll', anchor: null, offset: 0, fraction: Number(e.target.value) / 100 })}
          />
        </div>
      ) : null}
      {state && itemId && !shown ? <p role="status" className="muted remote-empty">Loading the page…</p> : null}
      {shown?.error ? <p role="alert" className="error">{shown.error}</p> : null}
      {shown?.data ? (
        <div className="remote-frame">
          <ContentFrame key={shown.id} html={shown.data.body_html} title={`Mirror of ${shown.data.title}`} fill frameRef={frameRef} onBridge={onBridge} />
        </div>
      ) : null}
      {pointerMode && state ? (
        <div
          className="remote-pointer-pad"
          aria-label="Pointer: move to point, tap to click"
          onPointerMove={(e) => {
            const p = rel(e);
            sendPointer(p.x, p.y, true);
          }}
          onPointerLeave={() => sendPointer(0, 0, false)}
          onPointerUp={(e) => {
            const p = rel(e);
            sendPointer(p.x, p.y, true);
            if (itemId) send({ type: 'tap', x: p.x, y: p.y });
          }}
        />
      ) : null}
    </div>
  );
}
