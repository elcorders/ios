import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api';
import { countdown, formatCode } from '../../lib/kiosk';
import { updateRecord, type KioskRecord } from '../../lib/kioskKey';
import { Logo } from './Logo';

const POLL_MS = 3_000;
const isMock = import.meta.env.VITE_API !== 'supabase';

/** Origin the staff phone opens (default: this page; set `VITE_KIOSK_PAIR_ORIGIN` to a LAN address for a localhost demo). */
export const pairOrigin = (): string => (import.meta.env.VITE_KIOSK_PAIR_ORIGIN || location.origin).replace(/\/+$/, '');
export const pairUrl = (code: string): string => `${pairOrigin()}/#/kiosk/pair?c=${code}`;

interface Pairing { pairing_id: string; code: string; expires_at: string }

export function PairingScreen({ record, onApproved }: { record: KioskRecord; onApproved: (deviceId: string) => void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [left, setLeft] = useState(0);
  const [round, setRound] = useState(0);
  const done = useRef(false);

  // Start a pairing (and a fresh one whenever the code expires).
  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await api.kioskPairStart(record.public_jwk);
      if (!live) return;
      if (!r.ok) {
        setError(true);
        window.setTimeout(() => live && setRound((n) => n + 1), 10_000);
        return;
      }
      setError(false);
      setPairing(r.data);
      void updateRecord({ pairing_id: r.data.pairing_id }).catch(() => undefined);
      QRCode.toDataURL(pairUrl(r.data.code), { margin: 2, width: 560, errorCorrectionLevel: 'M' })
        .then((u) => live && setQr(u))
        .catch(() => undefined);
    })();
    return () => {
      live = false;
    };
  }, [record.public_jwk, round]);

  // Countdown, local expiry and status polling.
  useEffect(() => {
    if (!pairing) return;
    const expires = Date.parse(pairing.expires_at);
    const renew = () => {
      setPairing(null);
      setQr(null);
      setRound((n) => n + 1);
    };
    const tick = () => {
      const ms = expires - Date.now();
      setLeft(ms);
      if (ms <= 0) renew();
    };
    tick();
    const clock = window.setInterval(tick, 1_000);
    const poll = window.setInterval(async () => {
      const r = await api.kioskPairStatus(pairing.pairing_id);
      if (!r.ok) return;
      if (r.data.status === 'approved' && r.data.device_id && !done.current) {
        done.current = true;
        onApproved(r.data.device_id);
      } else if (r.data.status === 'expired') renew();
    }, POLL_MS);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [pairing, onApproved]);

  async function simulate() {
    if (!pairing) return;
    const m = await import('../../api/mock/kiosk');
    m.mockSimulatePairApproval(pairing.pairing_id);
    const r = await api.kioskPairStatus(pairing.pairing_id);
    if (r.ok && r.data.status === 'approved' && r.data.device_id && !done.current) {
      done.current = true;
      onApproved(r.data.device_id);
    }
  }

  return (
    <main className="kiosk kiosk-center kiosk-pair">
      <Logo />
      <h1>Activate this screen</h1>
      <div className="pair-grid">
        <div className="pair-qr" aria-hidden={qr ? undefined : true}>
          {qr ? <img src={qr} alt="QR code to activate this kiosk" width={560} height={560} /> : <span className="muted">Preparing…</span>}
        </div>
        <div className="pair-text">
          <p className="kiosk-big">Scan with a staff phone to activate this screen</p>
          <p className="pair-code" aria-label="Pairing code">{pairing ? formatCode(pairing.code) : '····-····'}</p>
          <p className="muted" role="status">
            {error ? 'Cannot reach the server. Retrying…' : pairing ? `Code expires in ${countdown(left)}` : 'Getting a code…'}
          </p>
          {pairing ? (
            <p className="muted pair-origin">
              No camera? On the staff phone open <strong>{pairOrigin()}/#/kiosk/pair</strong> and type the code.
            </p>
          ) : null}
          {isMock && pairing ? (
            <button type="button" className="kiosk-link" onClick={() => void simulate()}>Simulate approval</button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
