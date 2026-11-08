import { useEffect, useState } from 'react';
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
    <section className="stack-lg">
      <Link to={back} className="back-link">← Back to {item.kind === 'tutorial' ? 'Tutorials' : 'Resources'}</Link>
      <div>
        <h1>{item.title}</h1>
        <p className="muted">Published {formatColombo(item.published_at, { dateStyle: 'medium' })}</p>
      </div>
      <ContentFrame html={item.body_html} title={item.title} />
    </section>
  );
}
