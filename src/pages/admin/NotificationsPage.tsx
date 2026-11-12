import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { PushStats } from '../../api/types';
import { usePushState } from '../../lib/push';

/** Admin › Notifications (§S16): push stats and a test to the signed-in admin. */
export function NotificationsPage() {
  const push = usePushState();
  const [stats, setStats] = useState<PushStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [needsDevice, setNeedsDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const r = await api.adminPushStats();
    if (r.ok) setStats(r.data);
    else setError('Could not load notification stats.');
  }, []);
  useEffect(() => {
    let live = true;
    void api.adminPushStats().then((r) => {
      if (!live) return;
      if (r.ok) setStats(r.data);
      else setError('Could not load notification stats.');
    });
    return () => {
      live = false;
    };
  }, []);

  async function sendTest() {
    setBusy(true);
    setResult(null);
    setError(null);
    setNeedsDevice(false);
    const t = await api.adminPushTest();
    if (!t.ok) {
      if (t.error.code === 'no_devices') {
        setNeedsDevice(true);
        setResult('Turn on notifications on this device first.');
      } else setError('Could not queue the test.');
      setBusy(false);
      return;
    }
    const s = await api.adminPushSend();
    if (!s.ok) setError('Could not send the test.');
    else if (s.data.sent > 0) setResult(`Sent to ${s.data.sent} device(s).`);
    else if (s.data.skipped > 0) setResult('Not sent: push keys not set on the server.');
    else if (s.data.failed > 0) setResult(`Failed for ${s.data.failed} device(s).`);
    else setResult('Nothing to send.');
    setBusy(false);
    void loadStats();
  }

  return (
    <section className="card stack" aria-label="Notifications">
      <h2>Notifications</h2>
      <p className="muted">Nothing is sent to students automatically. This page only checks that push works.</p>
      {stats ? (
        <ul aria-label="Push stats">
          <li>Students with push: {stats.students_with_push} of {stats.students}</li>
          <li>Devices: {stats.devices}</li>
          <li>Queued: {stats.queued}</li>
        </ul>
      ) : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <button type="button" className="primary" disabled={busy} onClick={() => void sendTest()}>Send test to me</button>
      {result ? <p role="status">{result}</p> : null}
      {needsDevice && (push.support === 'default' || push.support === 'granted') ? (
        <button
          type="button"
          disabled={push.busy}
          onClick={async () => {
            if (await push.enable()) {
              setNeedsDevice(false);
              setResult('This device is ready. Send the test again.');
              void loadStats();
            }
          }}
        >
          Turn on notifications on this device
        </button>
      ) : null}
      {needsDevice && push.support === 'unsupported' ? <p className="muted">Push is not available in this browser or build.</p> : null}
      {push.error ? <p role="alert" className="error">{push.error}</p> : null}
    </section>
  );
}
