import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { PendingRegistration } from '../../api/types';
import { messageFor } from '../../lib/errors';
import { formatColombo } from '../../lib/time';
import { useAdmin } from './AdminContext';
import { Dialog } from './Dialog';

interface Decision {
  row: PendingRegistration;
  kind: 'approve' | 'reject';
}

const nameOf = (r: PendingRegistration) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();

export function PendingPage() {
  const { cohort, readOnly, reloadCohorts } = useAdmin();
  const [rows, setRows] = useState<PendingRegistration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.adminListPending(cohort.id);
    if (res.ok) {
      setRows(res.data);
      setError(null);
    } else {
      setError(messageFor(res.error));
    }
  }, [cohort.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load on cohort change
    setRows(null);
    void load();
  }, [load]);

  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    const res = decision.kind === 'approve'
      ? await api.approvePending(decision.row.id)
      : await api.rejectPending(decision.row.id);
    setBusy(false);
    if (res.ok) {
      setDecision(null);
      setDialogError(null);
      await load();
      await reloadCohorts();
    } else {
      setDialogError(messageFor(res.error));
    }
  };

  const open = (row: PendingRegistration, kind: Decision['kind']) => {
    setDialogError(null);
    setDecision({ row, kind });
  };

  const waiting = (rows ?? []).filter((r) => r.status === 'pending');
  const decided = (rows ?? []).filter((r) => r.status !== 'pending');

  return (
    <div className="stack">
      <h2>Pending registrations</h2>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {!rows && !error ? <p role="status">Loading…</p> : null}
      {rows ? (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Pending registrations of cohort {cohort.code}</caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">ID number</th>
                <th scope="col">Username</th>
                <th scope="col">Name</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((r) => (
                <tr key={r.id}>
                  <td>{r.email}</td>
                  <td>{r.idnumber ?? ''}</td>
                  <td>{r.lms_username ?? ''}</td>
                  <td>{nameOf(r)}</td>
                  <td>{formatColombo(r.created_at)}</td>
                  <td className="actions">
                    <button type="button" disabled={readOnly} aria-label={`Approve ${r.email}`}
                      onClick={() => open(r, 'approve')}>Approve</button>
                    <button type="button" disabled={readOnly} aria-label={`Reject ${r.email}`}
                      onClick={() => open(r, 'reject')}>Reject</button>
                  </td>
                </tr>
              ))}
              {waiting.length === 0 ? <tr><td colSpan={6}>Nothing waiting.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {decided.length > 0 ? (
        <details>
          <summary>Decided ({decided.length})</summary>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Decided registrations</caption>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Name</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Decided</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((r) => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td>{nameOf(r)}</td>
                    <td>{r.status}</td>
                    <td>{r.decided_at ? formatColombo(r.decided_at) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      {decision ? (
        <Dialog
          title={decision.kind === 'approve' ? 'Approve registration' : 'Reject registration'}
          submitLabel={decision.kind === 'approve' ? 'Approve' : 'Reject'}
          onCancel={() => setDecision(null)}
          onSubmit={() => void submit()}
          busy={busy}
          error={dialogError}
        >
          <p>
            {decision.kind === 'approve' ? 'Add' : 'Reject'} {decision.row.email}
            {decision.kind === 'approve' ? ` to cohort ${cohort.code} as a student?` : '?'}
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
