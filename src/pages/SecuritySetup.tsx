import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api';
import type { TotpEnrolResult } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { CODE_LENGTH, CodeInput } from '../components/CodeInput';
import { messageFor } from '../lib/errors';

const passkeysAvailable = () => typeof window !== 'undefined' && 'PublicKeyCredential' in window;

/** Security setup gate (S1.F2): register a passkey, else enrol TOTP. */
export function SecuritySetup() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [totpMode, setTotpMode] = useState(() => !passkeysAvailable());

  async function done() {
    await refresh();
    navigate('/', { replace: true });
  }

  return (
    <section className="card">
      <h1>Secure your account</h1>
      <p>
        Your account needs a second way to sign in besides an email code, so nobody else can get in if they see your
        inbox. Add a passkey (fingerprint, face or screen lock), or use an authenticator app if your device cannot.
      </p>
      {totpMode ? <TotpSetup onDone={done} /> : <PasskeySetup onDone={done} onFallback={() => setTotpMode(true)} />}
    </section>
  );
}

function PasskeySetup({ onDone, onFallback }: { onDone: () => Promise<void>; onFallback: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await api.registerPasskey();
    if (res.ok) {
      await onDone();
      return;
    }
    setBusy(false);
    if (res.error.code === 'passkey_unsupported') onFallback();
    else if (res.error.code === 'passkey_cancelled') setError('Passkey setup was cancelled. You can try again.');
    else setError(messageFor(res.error));
  }

  return (
    <div className="stack">
      <button type="button" className="primary" disabled={busy} onClick={() => void add()}>Add a passkey</button>
      <button type="button" disabled={busy} onClick={onFallback}>My device can't use passkeys</button>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

function TotpSetup({ onDone }: { onDone: () => Promise<void> }) {
  const [enrol, setEnrol] = useState<TotpEnrolResult | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api.totpEnrol();
      if (cancelled) return;
      if (!res.ok) {
        setError(messageFor(res.error));
        return;
      }
      setEnrol(res.data);
      try {
        const url = await QRCode.toDataURL(res.data.otpauth_uri, { margin: 1, width: 220 });
        if (!cancelled) setQr(url);
      } catch {
        // The secret text below still works without the image.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    if (!enrol) return;
    try {
      await navigator.clipboard.writeText(enrol.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api.totpVerify(code);
    if (res.ok) {
      await onDone();
      return;
    }
    setBusy(false);
    setError(messageFor(res.error));
  }

  return (
    <form onSubmit={submit} className="stack">
      <p>
        Install Google Authenticator or Microsoft Authenticator, scan this QR code, then enter the 6-digit code it
        shows.
      </p>
      {enrol && (
        <>
          {qr && <img src={qr} alt="QR code for your authenticator app" width={220} height={220} />}
          <p>
            Can't scan? Enter this key manually: <code>{enrol.secret}</code>{' '}
            <button type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy key'}</button>
          </p>
          <CodeInput id="setup-code" label="Authenticator code" value={code} onChange={setCode} disabled={busy} />
          <button type="submit" className="primary" disabled={busy || code.length !== CODE_LENGTH}>Verify and finish</button>
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}
