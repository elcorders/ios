import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { INSECURE_MESSAGE } from '../../lib/kioskKey';
import { Board } from './Board';
import { PairingScreen } from './PairingScreen';
import { Viewer } from './Viewer';
import { useKiosk } from './useKiosk';
import { useKioskRemote, type RemotePointer } from './useKioskRemote';
import './kiosk.css';

/** S21 lab kiosk (CONTRACT §S21): full screen, outside the app Layout and the person's session. */
export function Kiosk() {
  const { id } = useParams();
  const k = useKiosk();
  const remote = useKioskRemote({ deviceId: k.record?.device_id ?? null, ready: k.phase === 'ready', itemId: id ?? null, feed: k.feed });
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
    return (
      <>
        {id ? (
          <Viewer key={id} id={id} feed={k.feed} online={k.online} zoom={remote.zoom} frameRef={remote.frameRef} onBridge={remote.onBridge} />
        ) : (
          <Board feed={k.feed} online={k.online} skew={k.skew} zoom={remote.zoom} refresh={{ onRefresh: k.refresh, until: k.refreshUntil }} />
        )}
        <RemoteOverlays controller={remote.lease?.controller_name ?? null} blank={remote.blank} pointer={remote.pointer} />
      </>
    );
  }
  return (
    <main className="kiosk kiosk-center">
      <h1>Lab kiosk</h1>
      <p role="status" className="kiosk-big muted">{k.phase === 'connecting' ? 'Connecting…' : 'Starting…'}</p>
    </main>
  );
}

/** S23: "Controlled by" badge, blank screen and laser dot, above whatever the kiosk shows. */
function RemoteOverlays({ controller, blank, pointer }: { controller: string | null; blank: boolean; pointer: RemotePointer | null }) {
  if (!controller) return null;
  return (
    <>
      {pointer ? (
        <span className="remote-pointer" aria-hidden="true" style={{ left: pointer.x, top: pointer.y }} />
      ) : null}
      {blank ? <div className="remote-blank" role="status">Screen paused</div> : null}
      <p className="remote-badge" role="status">Controlled by {controller}</p>
    </>
  );
}
