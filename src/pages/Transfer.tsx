import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { MyTransfers, TransferRequest } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { formatColombo } from '../lib/time';
import { Dialog } from './admin/Dialog';
import './Transfer.css';

const MESSAGES: Record<string, string> = {
  transfers_closed: 'Transfer requests are closed right now.',
  conflict: 'You already have an open request, or your group changed. Reload the page and check.',
  invalid_input: 'Please check your choices and reason, then try again.',
  rate_limited: 'Too many requests today — try again tomorrow.',
  forbidden: 'You are not an active student in this class.',
  cohort_archived: 'This class has been archived.',
};
const errorText = (code: string) => MESSAGES[code] ?? 'Something went wrong. Please try again.';

const MIN = 5;
const MAX = 500;

function historyLine(r: TransferRequest): { label: string; note: string | null } {
  switch (r.status) {
    case 'approved':
      return { label: `Moved to Group ${r.decided_no ?? ''}`.trim(), note: r.admin_note };
    case 'rejected':
      return { label: 'Not approved', note: r.admin_note };
    default:
      return { label: r.closed_by === 'admin' ? 'Closed by admin' : 'Cancelled', note: r.admin_note };
  }
}

export function Transfer() {
  const { me } = useAuth();
  const enrolment = me?.enrolments.find((e) => e.role === 'student' && e.status === 'active' && e.cohort_status === 'active');
  const cohortId = enrolment?.cohort_id;
  const [data, setData] = useState<MyTransfers | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pref1, setPref1] = useState('');
  const [pref2, setPref2] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!cohortId) return;
    const res = await api.getMyTransfers(cohortId);
    if (res.ok) {
      setData(res.data);
      setLoadError(null);
    } else setLoadError(errorText(res.error.code));
  }, [cohortId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load on mount
    void load();
  }, [load]);

  if (!me) return null;
  if (!enrolment || !cohortId) {
    return (
      <section className="card stack">
        <h1>Group change</h1>
        <p>There is no active class for you here.</p>
      </section>
    );
  }
  if (loadError) {
    return (
      <section className="card stack">
        <h1>Group change</h1>
        <p role="alert" className="error">{loadError}</p>
      </section>
    );
  }
  if (!data) return <p role="status">Loading…</p>;
  if (data.group_no == null) {
    return (
      <section className="card stack">
        <h1>Group change</h1>
        <p>You do not have a group yet. Answer the quick question first, then come back.</p>
        <Link to="/">Back to Home</Link>
      </section>
    );
  }

  const open = data.requests.find((r) => r.status === 'open') ?? null;
  const history = data.requests.filter((r) => r.status !== 'open');
  const others = data.groups.filter((g) => g.no !== data.group_no);
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= MIN && trimmed.length <= MAX;
  const valid = pref1 !== '' && pref2 !== '' && pref1 !== pref2 && reasonOk;

  async function submit() {
    if (!valid || !cohortId) return;
    setBusy(true);
    setError(null);
    const res = await api.requestTransfer({ cohortId, pref1No: Number(pref1), pref2No: Number(pref2), reason: trimmed });
    if (res.ok) {
      setPref1('');
      setPref2('');
      setReason('');
      await load();
    } else {
      setError(errorText(res.error.code));
      if (res.error.code === 'transfers_closed' || res.error.code === 'conflict') await load();
    }
    setBusy(false);
  }

  async function cancel() {
    if (!open) return;
    setBusy(true);
    setError(null);
    const res = await api.cancelTransfer(open.id);
    setBusy(false);
    if (res.ok) {
      setConfirming(false);
      await load();
    } else {
      setError(errorText(res.error.code));
    }
  }

  const name = (n: number) => `Group ${n}`;

  return (
    <section className="stack-lg">
      <div className="card stack">
        <h1>Group change</h1>
        <p>Your group: <strong>{name(data.group_no)}</strong></p>
        <Link to="/">Back to Home</Link>
      </div>

      {open ? (
        <div className="card stack" aria-label="Open request">
          <h2>Your request</h2>
          <span className="badge transfer-badge">Waiting for approval</span>
          <ul className="transfer-list">
            <li>Preference 1: <strong>{name(open.pref1_no)}</strong></li>
            <li>Preference 2: <strong>{name(open.pref2_no)}</strong></li>
            <li>Reason: {open.reason}</li>
            <li className="muted">Sent {formatColombo(open.created_at)}</li>
          </ul>
          {error && !confirming ? <p role="alert" className="error">{error}</p> : null}
          <button type="button" onClick={() => { setError(null); setConfirming(true); }}>Cancel request</button>
        </div>
      ) : data.transfers_open ? (
        <form className="card stack transfer-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <h2>Request a group change</h2>
          <label className="stack">
            Preference 1
            <select value={pref1} onChange={(e) => setPref1(e.target.value)}>
              <option value="">Choose a group</option>
              {others.map((g) => <option key={g.no} value={g.no}>{name(g.no)}</option>)}
            </select>
          </label>
          <label className="stack">
            Preference 2
            <select value={pref2} onChange={(e) => setPref2(e.target.value)}>
              <option value="">Choose a group</option>
              {others.filter((g) => String(g.no) !== pref1).map((g) => <option key={g.no} value={g.no}>{name(g.no)}</option>)}
            </select>
          </label>
          <label className="stack">
            Reason
            <textarea value={reason} maxLength={MAX} onChange={(e) => setReason(e.target.value)} />
          </label>
          <p className="muted transfer-counter" id="reason-count">
            {reason.length}/{MAX} characters{trimmed.length < MIN ? ` (at least ${MIN})` : ''}
          </p>
          {error ? <p role="alert" className="error">{error}</p> : null}
          <button type="submit" className="primary" disabled={!valid || busy}>Submit</button>
        </form>
      ) : (
        <div className="card">
          <p>Transfer requests are closed right now.</p>
        </div>
      )}

      {history.length > 0 ? (
        <div className="card stack">
          <h2>History</h2>
          <ul className="transfer-list" aria-label="History">
            {history.map((r) => {
              const h = historyLine(r);
              return (
                <li key={r.id}>
                  <strong>{h.label}</strong>
                  {h.note ? <span>{h.note}</span> : null}
                  <span className="muted">Sent {formatColombo(r.created_at)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {confirming ? (
        <Dialog
          title="Cancel this request?"
          submitLabel="Cancel request"
          busy={busy}
          error={error}
          onCancel={() => setConfirming(false)}
          onSubmit={() => void cancel()}
        >
          <p>Your group will not change. You can send a new request afterwards.</p>
        </Dialog>
      ) : null}
    </section>
  );
}
