import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { ContentItem, KioskFeed } from '../../api/types';
import { ContentFrame } from '../../components/ContentFrame';
import { useKioskTo } from './Board';

type State = { step: 'loading' } | { step: 'missing' } | { step: 'error' } | { step: 'ready'; item: ContentItem };

/** Full-screen content with a big Back button (sandboxed like the student viewer). */
export function Viewer({ id, feed, online }: { id: string; feed: KioskFeed | null; online: boolean }) {
  const to = useKioskTo();
  const [state, setState] = useState<State>({ step: 'loading' });
  useEffect(() => {
    let live = true;
    api.kioskGetContent(id).then((r) => {
      if (!live) return;
      if (r.ok) setState({ step: 'ready', item: r.data });
      else setState({ step: r.error.code === 'not_found' ? 'missing' : 'error' });
    });
    return () => {
      live = false;
    };
  }, [id]);

  const title = state.step === 'ready' ? state.item.title : 'Content';
  return (
    <main className="kiosk kiosk-viewer">
      <div className="viewer-bar">
        <Link className="kiosk-back" to={to('/kiosk')}>← Back</Link>
        <h1>{title}</h1>
        <span className="kiosk-spacer" />
        <span className="kiosk-device">{feed?.device.name ?? ''}</span>
        <span className={`kiosk-conn ${online ? 'on' : 'off'}`} role="status"><span className="dot" aria-hidden="true" />{online ? 'Connected' : 'Offline'}</span>
      </div>
      {state.step === 'loading' ? <p role="status" className="kiosk-big muted kiosk-empty">Loading…</p> : null}
      {state.step === 'missing' ? <p className="kiosk-big kiosk-empty">This item is not available yet.</p> : null}
      {state.step === 'error' ? <p role="alert" className="kiosk-big kiosk-empty">Could not load this page. Try again in a moment.</p> : null}
      {state.step === 'ready' ? (
        <div className="viewer-frame"><ContentFrame html={state.item.body_html} title={state.item.title} fill /></div>
      ) : null}
    </main>
  );
}
