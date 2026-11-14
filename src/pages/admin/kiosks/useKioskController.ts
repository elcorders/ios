import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../api';
import type { KioskChannel, KioskCommand, KioskControl, KioskMenuItem, KioskRemoteState } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { LEASE_HEARTBEAT_MS, parseRemoteState } from '../../../lib/kioskRemote';

export type ControlPhase =
  | { step: 'idle' }
  | { step: 'starting' }
  | { step: 'confirm'; holder: string; self: boolean }
  | { step: 'controlling'; lease: KioskControl }
  | { step: 'ended'; message: string };

const endedText = (d: unknown): string => {
  const x = (d ?? {}) as { end_reason?: string; taken_over_by_name?: string | null };
  if (x.end_reason === 'taken_over') return `Taken over by ${x.taken_over_by_name ?? 'another admin'}.`;
  if (x.end_reason === 'expired') return 'Control ended: the connection was lost for more than a minute.';
  if (x.end_reason === 'revoked') return 'Control ended: this kiosk was revoked.';
  return 'Control ended.';
};

/**
 * Controller side of the S23 remote (CONTRACT §S23): lease start / take-over / heartbeat / release,
 * the `kiosk:<device>` channel, and the kiosk's last reported state.
 */
export function useKioskController(deviceId: string) {
  const [phase, setPhase] = useState<ControlPhase>({ step: 'idle' });
  const [state, setState] = useState<KioskRemoteState | null>(null);
  const [menu, setMenu] = useState<KioskMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const channel = useRef<KioskChannel | null>(null);
  const leaseRef = useRef<KioskControl | null>(null);
  const seq = useRef(0);
  const beatRef = useRef<(id: string) => Promise<void>>(async () => undefined);

  const send = useCallback((cmd: KioskCommand) => {
    const lease = leaseRef.current;
    if (!lease || !channel.current) return;
    seq.current += 1;
    channel.current.send('cmd', { v: 1, lease_id: lease.id, seq: seq.current, cmd });
  }, []);

  // Channel for the page's lifetime.
  useEffect(() => {
    let closed = false;
    let off: (() => void) | null = null;
    void api.kioskRemoteChannel(deviceId, 'controller').then((r) => {
      if (!r.ok) {
        if (!closed) setError(messageFor(r.error));
        return;
      }
      if (closed) {
        r.data.close();
        return;
      }
      channel.current = r.data;
      off = r.data.on('state', (raw) => {
        const s = parseRemoteState(raw);
        if (!s) return;
        setState(s);
        if (s.menu) setMenu(s.menu);
        const mineId = leaseRef.current?.id;
        if (mineId && s.lease_id && s.lease_id !== mineId) void beatRef.current(mineId);
      });
      if (leaseRef.current) send({ type: 'hello' });
    });
    return () => {
      closed = true;
      off?.();
      channel.current?.close();
      channel.current = null;
    };
  }, [deviceId, send]);

  const start = useCallback(async (takeOver: boolean) => {
    setError(null);
    setPhase({ step: 'starting' });
    const r = await api.kioskControlStart(deviceId, takeOver);
    if (r.ok) {
      leaseRef.current = r.data;
      seq.current = 0;
      setPhase({ step: 'controlling', lease: r.data });
      send({ type: 'hello' });
      return;
    }
    if (r.error.code === 'controlled') {
      const d = (r.error.details ?? {}) as { controller_name?: string; self?: boolean };
      setPhase({ step: 'confirm', holder: d.controller_name ?? 'another admin', self: !!d.self });
      return;
    }
    setPhase({ step: 'idle' });
    setError(messageFor(r.error));
  }, [deviceId, send]);

  const release = useCallback(async () => {
    const lease = leaseRef.current;
    if (!lease) return;
    send({ type: 'release' });
    leaseRef.current = null;
    setPhase({ step: 'ended', message: 'You released the screen.' });
    await api.kioskControlEnd(lease.id);
  }, [send]);

  const cancelConfirm = useCallback(() => setPhase({ step: 'idle' }), []);

  // Heartbeat while controlling (and at once when the kiosk reports someone else's lease).
  const leaseId = phase.step === 'controlling' ? phase.lease.id : null;
  const beat = useCallback(async (id: string) => {
    const r = await api.kioskControlHeartbeat(id);
    if (leaseRef.current?.id !== id) return;
    if (r.ok) {
      leaseRef.current = r.data;
      return;
    }
    if (r.error.code === 'lease_ended' || r.error.code === 'not_found' || r.error.code === 'forbidden') {
      leaseRef.current = null;
      setPhase({ step: 'ended', message: r.error.code === 'lease_ended' ? endedText(r.error.details) : 'Control ended.' });
    }
  }, []);
  useEffect(() => {
    beatRef.current = beat;
  }, [beat]);
  useEffect(() => {
    if (!leaseId) return;
    const t = window.setInterval(() => void beat(leaseId), LEASE_HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [leaseId, beat]);

  // Leaving the page (or closing the tab) releases the screen.
  useEffect(() => {
    const onHide = () => {
      const lease = leaseRef.current;
      if (!lease) return;
      channel.current?.send('cmd', { v: 1, lease_id: lease.id, seq: ++seq.current, cmd: { type: 'release' } });
      void api.kioskControlEnd(lease.id);
      leaseRef.current = null;
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, []);

  // Until the kiosk answers under our lease, say hello again every 3 s.
  const answered = !!(state && leaseId && state.lease_id === leaseId);
  useEffect(() => {
    if (!leaseId || answered) return;
    const t = window.setInterval(() => send({ type: 'hello' }), 3_000);
    return () => window.clearInterval(t);
  }, [leaseId, answered, send]);

  // Only trust state that belongs to our lease for "what the kiosk shows".
  const mine = answered ? state : null;
  return { phase, state: mine, menu, error, start, release, send, cancelConfirm };
}
