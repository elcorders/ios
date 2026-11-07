import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { LmsLandingParams, LmsLandingResult, Result } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { EmailCodeFlow } from '../components/EmailCodeFlow';
import { messageFor } from '../lib/errors';
import { normaliseLkPhone } from '../lib/phone';
import { PasskeyPanel } from './Login';

export const PREFILL_KEY = 'ios.prefill';

interface Captured {
  params: LmsLandingParams | null;
  first: string;
  last: string;
  promise: Promise<Result<LmsLandingResult>> | null;
}

let captured: Captured | null = null;

/** Test helper: forget the captured link. */
export function resetLmsCapture(): void {
  captured = null;
}

/**
 * Read the link parameters from the hash query and strip them from the URL at once,
 * so nothing stays in history or bookmarks. Re-renders (and StrictMode) reuse the first capture.
 */
function captureLink(): Captured {
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  if (q === -1) {
    return captured ?? { params: null, first: '', last: '', promise: null };
  }
  const sp = new URLSearchParams(hash.slice(q + 1));
  const path = hash.slice(0, q) || '#/lms';
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${path}`);

  const get = (k: string) => sp.get(k)?.trim() ?? '';
  const phone = normaliseLkPhone(get('mobile')) ?? normaliseLkPhone(get('phone'));
  if (phone) sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ phone }));

  const key = get('k');
  const course = get('course');
  const email = get('email');
  captured = {
    params: key && course ? {
      key,
      course_id: course,
      email,
      idnumber: get('idnumber') || undefined,
      username: get('username') || undefined,
      first: get('first') || undefined,
      last: get('last') || undefined,
    } : null,
    first: get('first'),
    last: get('last'),
    promise: null,
  };
  return captured;
}

type State =
  | { step: 'loading' }
  | { step: 'error'; message: string }
  | { step: 'result'; result: LmsLandingResult };

export function LmsLanding() {
  const [link] = useState(captureLink);
  const [state, setState] = useState<State>(
    link.params ? { step: 'loading' } : { step: 'error', message: messageFor({ code: 'invalid_link' }) },
  );
  const { me, loading, refresh } = useAuth();
  const navigate = useNavigate();
  // Already signed in on this device: no landing check, no email code — go Home (RequireAuth applies the gates).
  const signedIn = !loading && me !== null;

  useEffect(() => {
    if (!link.params || loading || me) return;
    let live = true;
    link.promise ??= api.lmsLanding(link.params);
    void link.promise.then((res) => {
      if (!live) return;
      setState(res.ok ? { step: 'result', result: res.data } : { step: 'error', message: messageFor(res.error) });
    });
    return () => {
      live = false;
    };
  }, [link, loading, me]);

  async function verified() {
    await refresh();
    navigate('/', { replace: true });
  }

  if (signedIn) return <Navigate to="/" replace />;
  if (loading || state.step === 'loading') return <p role="status">Checking your link…</p>;
  if (state.step === 'error') {
    return (
      <section className="card">
        <h1>LMS link problem</h1>
        <p role="alert" className="error">{state.message}</p>
      </section>
    );
  }
  if (state.result.status === 'pending') {
    return (
      <section className="card">
        <h1>Not on the class list yet</h1>
        <p>You're not on the class list yet; Fuzail will check. You can close this page and come back later.</p>
      </section>
    );
  }
  const name = `${link.first} ${link.last}`.trim();
  return (
    <section className="card">
      <h1>Welcome to class {state.result.cohort_code}</h1>
      {name && <p>Name: <strong>{name}</strong></p>}
      <h2>Already set up?</h2>
      <PasskeyPanel onDone={() => void verified()} />
      <p><Link to="/login">Use an authenticator app instead</Link></p>
      <h2>First time here?</h2>
      <p>We'll email you a 6-digit code.</p>
      <EmailCodeFlow idPrefix="lms" fixedEmail={state.result.email} onVerified={() => void verified()} />
    </section>
  );
}
