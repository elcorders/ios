import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import type { Mac } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { Dialog } from '../Dialog';
import '../table/table.css';

type Editing = { mac: Mac | null } | null;

export function MacsTab() {
  const [macs, setMacs] = useState<Mac[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    const res = await api.adminListMacs();
    if (res.ok) {
      setMacs(res.data);
      setError(null);
    } else setError(messageFor(res.error));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const toggle = async (m: Mac) => {
    const res = await api.adminUpsertMac({
      id: m.id, no: m.no, label: m.label, notes: m.notes,
      status: m.status === 'in_service' ? 'out_of_service' : 'in_service',
    });
    if (res.ok) await load();
    else setError(messageFor(res.error));
  };

  return (
    <div className="stack">
      <div className="row">
        <h3>Macs</h3>
        <button type="button" onClick={() => setEditing({ mac: null })}>Add Mac</button>
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {!macs && !error ? <p role="status">Loading…</p> : null}
      {macs ? (
        <div className="table-wrap admin-table">
          <table>
            <caption className="sr-only">Lab Macs</caption>
            <thead>
              <tr>
                <th scope="col">No</th><th scope="col">Label</th><th scope="col">Status</th>
                <th scope="col">Notes</th><th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {macs.map((m) => (
                <tr key={m.id}>
                  <td className="c-name">Mac {m.no}</td>
                  <td className="c-index">{m.label ?? ''}</td>
                  <td className="c-status">{m.status === 'in_service' ? 'In service' : 'Out of service'}</td>
                  <td className="c-wide">{m.notes ?? ''}</td>
                  <td className="c-actions">
                    <div className="row actions">
                      <button type="button" aria-label={`Edit Mac ${m.no}`} onClick={() => setEditing({ mac: m })}>Edit</button>
                      <button type="button" aria-label={m.status === 'in_service' ? `Take Mac ${m.no} out of service` : `Return Mac ${m.no} to service`}
                        onClick={() => void toggle(m)}>
                        {m.status === 'in_service' ? 'Take out' : 'Return'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {macs.length === 0 ? <tr><td colSpan={5}>No Macs yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {editing ? (
        <MacDialog mac={editing.mac} nextNo={(macs ?? []).reduce((n, m) => Math.max(n, m.no), 0) + 1}
          onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      ) : null}
    </div>
  );
}

function MacDialog({ mac, nextNo, onCancel, onSaved }: { mac: Mac | null; nextNo: number; onCancel: () => void; onSaved: () => void }) {
  const [no, setNo] = useState(String(mac?.no ?? nextNo));
  const [label, setLabel] = useState(mac?.label ?? '');
  const [notes, setNotes] = useState(mac?.notes ?? '');
  const [inService, setInService] = useState((mac?.status ?? 'in_service') === 'in_service');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = Number(no);
    if (!Number.isInteger(n) || n < 1) {
      setError('Mac number must be a whole number, 1 or more.');
      return;
    }
    setBusy(true);
    const res = await api.adminUpsertMac({
      id: mac?.id ?? null, no: n, label: label.trim() || null, notes: notes.trim() || null,
      status: inService ? 'in_service' : 'out_of_service',
    });
    setBusy(false);
    if (res.ok) onSaved();
    else setError(res.error.code === 'conflict' ? 'That Mac number is already used.' : messageFor(res.error));
  };

  return (
    <Dialog title={mac ? `Edit Mac ${mac.no}` : 'Add Mac'} submitLabel="Save" busy={busy} error={error} onCancel={onCancel} onSubmit={() => void submit()}>
      <div className="field">
        <label htmlFor="mac-no">Number</label>
        <input id="mac-no" type="number" min={1} value={no} onChange={(e) => setNo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="mac-label">Label</label>
        <input id="mac-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="mac-notes">Notes</label>
        <input id="mac-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <label className="row">
        <input type="checkbox" checked={inService} onChange={(e) => setInService(e.target.checked)} /> In service
      </label>
    </Dialog>
  );
}
