import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ContentKind, ContentSummary } from '../api/types';
import { formatColombo } from '../lib/time';

type State = { step: 'loading' } | { step: 'error'; message: string } | { step: 'ready'; items: ContentSummary[] };

function Cards({ items }: { items: ContentSummary[] }) {
  return (
    <ul className="content-list">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={`/c/${i.id}`} className="card content-card">
            <span className="content-card-title">{i.title}</span>
            {i.summary ? <span className="muted">{i.summary}</span> : null}
            <span className="muted content-card-date">{formatColombo(i.published_at, { dateStyle: 'medium' })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ContentList({ kind, heading, intro }: { kind: ContentKind; heading: string; intro: string }) {
  const [state, setState] = useState<State>({ step: 'loading' });
  useEffect(() => {
    let live = true;
    api.listContent(kind).then((r) => {
      if (!live) return;
      setState(r.ok ? { step: 'ready', items: r.data } : { step: 'error', message: 'Could not load this list. Please try again.' });
    });
    return () => {
      live = false;
    };
  }, [kind]);

  const groups: [string | null, ContentSummary[]][] = [];
  if (state.step === 'ready') {
    const codes = [...new Set(state.items.map((i) => i.cohort_code))];
    const grouped = kind === 'tutorial' && codes.length > 1;
    if (grouped) for (const c of codes) groups.push([c, state.items.filter((i) => i.cohort_code === c)]);
    else groups.push([null, state.items]);
  }

  return (
    <section className="stack-lg">
      <div className="card hero">
        <h1>{heading}</h1>
        <p className="muted">{intro}</p>
      </div>
      {state.step === 'loading' && <p role="status">Loading…</p>}
      {state.step === 'error' && <p role="alert" className="error">{state.message}</p>}
      {state.step === 'ready' && state.items.length === 0 && (
        <div className="card"><p className="muted">Nothing here yet. Check back soon.</p></div>
      )}
      {state.step === 'ready' &&
        groups.map(([code, items]) => (
          <div key={code ?? 'all'} className="stack">
            {code ? <h2>{code}</h2> : null}
            <Cards items={items} />
          </div>
        ))}
    </section>
  );
}
