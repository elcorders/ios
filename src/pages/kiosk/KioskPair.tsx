import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import type { AdminCohort, ApiError, KioskDevice } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { formatCode, isWellFormedCode, normaliseCode } from '../../lib/kiosk';
import './kiosk.css';

const ERRORS: Record<string, string> = {
  invalid_code: 'This code has expired or was already used. Refresh the kiosk screen.',
  forbidden: 'Only staff can activate a kiosk.',
  conflict: 'Another kiosk already has that name. Choose a different name.',
  invalid_input: 'Give the screen a name of 1 to 60 characters.',
  cohort_archived: 'That class has been archived. Choose another class.',
  not_found: 'That class no longer exists. Refresh the page.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
};
const errorText = (e: ApiError) => ERRORS[e.code] ?? 'Something went wrong. Please try again.';

/** S21 staff page that activates a kiosk from its QR code (CONTRACT §S21). Phone first. */
export function KioskPair() {
  const { me } = useAuth();
  const [params] = useSearchParams();
  const fromUrl = params.get('c') ?? '';
  const [typed, setTyped] = useState(fromUrl);
  const [code, setCode] = useState<string | null>(null); // normalised, confirmed by lookup
  const [checking, setChecking] = useState(!!fromUrl);
  const [name, setName] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [cohorts, setCohorts] = useState<AdminCohort[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<KioskDevice | null>(null);

  const isAdmin = !!me?.is_admin;
  const staff = isAdmin || !!me?.enrolments.some((e) => e.role === 'instructor' && e.status === 'active' && e.cohort_status === 'active');

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    void api.adminListCohorts().then((r) => {
      if (live && r.ok) setCohorts(r.data.filter((c) => c.status === 'active'));
    });
    return () => {
      live = false;
    };
  }, [isAdmin]);

  async function lookup(raw: string) {
    setError(null);
    if (!isWellFormedCode(raw)) {
      setError('Enter the 8 characters shown on the kiosk screen.');
      return;
    }
    setChecking(true);
    const r = await api.kioskPairLookup(normaliseCode(raw));
    setChecking(false);
    if (r.ok) setCode(normaliseCode(raw));
    else {
      setCode(null);
      setError(errorText(r.error));
    }
  }

  // A code in the link is checked right away.
  useEffect(() => {
    if (!staff || !fromUrl) return;
    let live = true;
    void api.kioskPairLookup(normaliseCode(fromUrl)).then((r) => {
      if (!live) return;
      setChecking(false);
      if (r.ok) setCode(normaliseCode(fromUrl));
      else setError(errorText(r.error));
    });
    return () => {
      live = false;
    };
  }, [staff, fromUrl]);

  async function activate(e: FormEvent) {
    e.preventDefault();
    if (!code) return;
    setBusy(true);
    setError(null);
    const r = await api.kioskPairApprove(code, name.trim(), isAdmin && cohortId ? cohortId : null);
    setBusy(false);
    if (r.ok) setDone(r.data);
    else {
      setError(errorText(r.error));
      if (r.error.code === 'invalid_code') setCode(null);
    }
  }

  if (!staff) {
    return (
      <section className="card stack">
        <h1>Activate a kiosk</h1>
        <p role="alert">Only staff can activate a kiosk.</p>
      </section>
    );
  }
  if (done) {
    return (
      <section className="card stack" aria-live="polite">
        <h1>Kiosk activated</h1>
        <p role="status" className="kiosk-pair-ok">{done.name} is active</p>
        <p className="muted">The screen will show the board in a few seconds.</p>
      </section>
    );
  }
  return (
    <section className="card stack kiosk-pair-page">
      <h1>Activate a kiosk</h1>
      {code ? (
        <form className="stack" onSubmit={(e) => void activate(e)}>
          <p>Code matches the screen? <strong className="pair-code-small">{formatCode(code)}</strong></p>
          <label>
            Device name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              placeholder="Lab 2 front TV"
              autoComplete="off"
              enterKeyHint="done"
            />
          </label>
          {isAdmin ? (
            <label>
              Class
              <select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                <option value="">Current cohort</option>
                {cohorts.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </label>
          ) : null}
          {error ? <p role="alert" className="error">{error}</p> : null}
          <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? 'Activating…' : 'Activate'}</button>
          <button type="button" className="link" onClick={() => { setCode(null); setError(null); }}>Use a different code</button>
        </form>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void lookup(typed); }}>
          <p className="muted">Scan the QR code on the kiosk screen, or type the code shown there.</p>
          <label>
            Code on the screen
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={12}
            />
          </label>
          {error ? <p role="alert" className="error">{error}</p> : null}
          <button type="submit" className="primary" disabled={checking || !typed.trim()}>{checking ? 'Checking…' : 'Check code'}</button>
        </form>
      )}
    </section>
  );
}
