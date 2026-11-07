import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { CODE_LENGTH, CodeInput } from '../components/CodeInput';
import { EmailCodeFlow } from '../components/EmailCodeFlow';
import { messageFor } from '../lib/errors';

type Tab = 'passkey' | 'email' | 'totp';
const TABS: { id: Tab; label: string }[] = [
  { id: 'passkey', label: 'Passkey' },
  { id: 'email', label: 'Email code' },
  { id: 'totp', label: 'Authenticator app' },
];

export function Login() {
  const [tab, setTab] = useState<Tab>('passkey');
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function done() {
    await refresh();
    navigate('/', { replace: true });
  }

  return (
    <section className="card">
      <h1>Sign in</h1>
      <div role="tablist" aria-label="Sign-in method" className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'passkey' && <PasskeyPanel onDone={done} />}
        {tab === 'email' && <EmailCodeFlow idPrefix="login" onVerified={done} />}
        {tab === 'totp' && <TotpPanel onDone={done} />}
      </div>
    </section>
  );
}

export function PasskeyPanel({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const res = await api.signInWithPasskey();
    setBusy(false);
    if (res.ok) onDone();
    else setError(messageFor(res.error));
  }
  return (
    <div className="stack">
      <button type="button" className="primary" disabled={busy} onClick={() => void go()}>Sign in with passkey</button>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

export function TotpPanel({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api.totpLogin(email.trim(), code);
    setBusy(false);
    if (res.ok) onDone();
    else setError(messageFor(res.error));
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="totp-email">Email</label>
        <input id="totp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <CodeInput id="totp-code" label="Authenticator code" value={code} onChange={setCode} disabled={busy} />
      <button type="submit" disabled={busy || !email.trim() || code.length !== CODE_LENGTH}>Sign in</button>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}
