import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatColombo } from '../lib/time';

const APP_NAME = 'NIBM iOS';

export function shortSha(sha: string | undefined): string {
  const s = (sha ?? '').trim();
  return s ? s.slice(0, 7) : 'dev';
}

export function Health() {
  const [adapter, setAdapter] = useState('checking…');

  useEffect(() => {
    let cancelled = false;
    void api.health().then((r) => {
      if (cancelled) return;
      setAdapter(r.ok ? `${r.data.adapter}${r.data.ok ? '' : ' (not ok)'}` : `error: ${r.error.code}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const built = formatColombo(__BUILD_TIME__, { dateStyle: 'medium', timeStyle: 'medium' });

  return (
    <section className="card">
      <h1>Health</h1>
      <dl>
        <dt>App</dt>
        <dd data-testid="app-name">{APP_NAME}</dd>
        <dt>Commit</dt>
        <dd data-testid="commit">{shortSha(import.meta.env.VITE_COMMIT_SHA)}</dd>
        <dt>Built (Asia/Colombo)</dt>
        <dd data-testid="built">{built}</dd>
        <dt>Adapter</dt>
        <dd data-testid="adapter">{adapter}</dd>
      </dl>
    </section>
  );
}
