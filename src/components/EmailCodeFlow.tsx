import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { messageFor } from '../lib/errors';
import { CODE_LENGTH, CodeInput } from './CodeInput';

interface Props {
  /** When set, the email is shown read-only (LMS landing). */
  fixedEmail?: string;
  idPrefix: string;
  onVerified: () => void;
}

/** Email -> send code -> 6-digit code -> verify. */
export function EmailCodeFlow({ fixedEmail, idPrefix, onVerified }: Props) {
  const [email, setEmail] = useState(fixedEmail ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api.sendEmailCode(email.trim());
    setBusy(false);
    if (res.ok) {
      setSent(true);
      setCode('');
    } else setError(messageFor(res.error));
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api.verifyEmailCode(email.trim(), code);
    setBusy(false);
    if (res.ok) onVerified();
    else setError(messageFor(res.error));
  }

  return (
    <form onSubmit={sent ? verify : send} className="stack">
      <div className="field">
        <label htmlFor={`${idPrefix}-email`}>Email</label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="email"
          value={email}
          readOnly={fixedEmail !== undefined || sent}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {sent ? (
        <>
          <p role="status">We sent a 6-digit code to your email.</p>
          <CodeInput id={`${idPrefix}-code`} label="6-digit code" value={code} onChange={setCode} disabled={busy} />
          <button type="submit" disabled={busy || code.length !== CODE_LENGTH}>Verify code</button>
          <button type="button" className="link" disabled={busy} onClick={() => void send()}>Send a new code</button>
        </>
      ) : (
        <button type="submit" disabled={busy || !email.trim()}>Send code</button>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}
