import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { INSECURE_MESSAGE } from '../../lib/kioskKey';
import { Board } from './Board';
import { PairingScreen } from './PairingScreen';
import { Viewer } from './Viewer';
import { useKiosk } from './useKiosk';
import './kiosk.css';

/** S21 lab kiosk (CONTRACT §S21): full screen, outside the app Layout and the person's session. */
export function Kiosk() {
  const { id } = useParams();
  const k = useKiosk();
  // `?reset=1` (mock demo only) is applied once by useKiosk; drop it so links and reloads do not repeat it.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!params.has('reset')) return;
    const next = new URLSearchParams(params);
    next.delete('reset');
    setParams(next, { replace: true });
  }, [params, setParams]);

  if (k.phase === 'insecure') {
    return (
      <main className="kiosk kiosk-center">
        <h1>Lab kiosk</h1>
        <p role="alert" className="kiosk-big">{INSECURE_MESSAGE}</p>
      </main>
    );
  }
  if (k.phase === 'pairing' && k.record) return <PairingScreen record={k.record} onApproved={k.approved} />;
  if (k.phase === 'ready') {
    return id ? <Viewer key={id} id={id} feed={k.feed} online={k.online} /> : <Board feed={k.feed} online={k.online} skew={k.skew} />;
  }
  return (
    <main className="kiosk kiosk-center">
      <h1>Lab kiosk</h1>
      <p role="status" className="kiosk-big muted">{k.phase === 'connecting' ? 'Connecting…' : 'Starting…'}</p>
    </main>
  );
}
