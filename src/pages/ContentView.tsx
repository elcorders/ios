import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { ContentItem } from '../api/types';
import { ContentFrame } from '../components/ContentFrame';
import { formatColombo } from '../lib/time';

type State =
  | { step: 'loading' }
  | { step: 'missing' }
  | { step: 'error' }
  | { step: 'ready'; item: ContentItem };

export function ContentView() {
  const { id } = useParams();
  const [state, setState] = useState<State>({ step: 'loading' });
  const frameWrap = useRef<HTMLDivElement>(null);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  useEffect(() => {
    let live = true;
    api.getContent(id ?? '').then((r) => {
      if (!live) return;
      if (r.ok) setState({ step: 'ready', item: r.data });
      else setState({ step: r.error.code === 'not_found' ? 'missing' : 'error' });
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (state.step === 'loading') return <p role="status">Loading…</p>;
  if (state.step === 'error') return <p role="alert" className="error">Could not load this page. Please try again.</p>;
  if (state.step === 'missing') {
    return (
      <section className="stack-lg">
        <div className="card">
          <h1>Not available yet</h1>
          <p className="muted">This item is not available yet. Check back later.</p>
        </div>
        <Link to="/">Back to home</Link>
      </section>
    );
  }
  const { item } = state;
  const back = item.kind === 'tutorial' ? '/tutorials' : '/resources';
  return (
    <section className="content-view">
      <div className="content-view-bar">
        <Link to={back} className="back-link" aria-label={`Back to ${item.kind === 'tutorial' ? 'Tutorials' : 'Resources'}`}>←</Link>
        <div className="content-view-title">
          <h1>{item.title}</h1>
          <p className="muted">Published {formatColombo(item.published_at, { dateStyle: 'medium' })}</p>
        </div>
        {canFullscreen ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Full screen"
            title="Full screen"
            onClick={() => void frameWrap.current?.querySelector('iframe')?.requestFullscreen()}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        ) : null}
      </div>
      <div ref={frameWrap}>
        <ContentFrame html={item.body_html} title={item.title} />
      </div>
    </section>
  );
}
