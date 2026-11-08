import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../api';
import type { Closure, ClosureKind } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { Dialog } from '../Dialog';
import { KIND_LABELS, addDaysIso, colomboToday, isValidDate, parseClosureLines } from './labHelpers';
import '../table/table.css';

const KINDS = Object.keys(KIND_LABELS) as ClosureKind[];

function KindSelect({ id, value, onChange }: { id: string; value: ClosureKind; onChange: (k: ClosureKind) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as ClosureKind)}>
      {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
    </select>
  );
}

export function ClosuresTab() {
  const today = useMemo(() => colomboToday(), []);
  const [past, setPast] = useState(false);
  const [rows, setRows] = useState<Closure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Closure | null>(null);

  const load = useCallback(async () => {
    const res = past ? await api.listClosures(addDaysIso(today, -730), addDaysIso(today, -1)) : await api.listClosures(today, addDaysIso(today, 730));
    if (res.ok) {
      setRows(past ? [...res.data].reverse() : res.data);
      setError(null);
    } else setError(messageFor(res.error));
  }, [past, today]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load
    void load();
  }, [load]);

  const remove = async () => {
    if (!deleting) return;
    const res = await api.adminDeleteClosure(deleting.id);
    setDeleting(null);
    if (res.ok) {
      setNotice('Closure deleted.');
      await load();
    } else setError(messageFor(res.error));
  };

  return (
    <div className="stack">
      <h3>Closures</h3>
      <label className="row">
        <input type="checkbox" checked={past} onChange={(e) => { setRows(null); setPast(e.target.checked); }} /> Show past closures
      </label>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!rows && !error ? <p role="status">Loading…</p> : null}
      {rows ? (
        <div className="table-wrap admin-table">
          <table>
            <caption className="sr-only">{past ? 'Past' : 'Upcoming'} closures</caption>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Kind</th><th scope="col">Reason</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="c-name">{c.date}</td>
                  <td className="c-status"><span className="badge">{KIND_LABELS[c.kind]}</span></td>
                  <td className="c-wide">{c.reason ?? ''}</td>
                  <td className="c-actions">
                    <button type="button" aria-label={`Delete closure ${c.date}`} onClick={() => setDeleting(c)}>Delete</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={4}>No {past ? 'past' : 'upcoming'} closures.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      <AddOne onDone={(m) => { setNotice(m); void load(); }} />
      <PasteMany onDone={(m) => { setNotice(m); void load(); }} />
      {deleting ? (
        <Dialog title="Delete closure" submitLabel="Delete" onCancel={() => setDeleting(null)} onSubmit={() => void remove()}>
          <p>Delete the {KIND_LABELS[deleting.kind].toLowerCase()} on {deleting.date}?</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function AddOne({ onDone }: { onDone: (msg: string) => void }) {
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<ClosureKind>('class_day');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidDate(date)) return setError('Choose a date.');
    const res = await api.adminAddClosures([{ date, kind, reason: reason.trim() || null }]);
    if (res.ok) {
      setError(null);
      setDate('');
      setReason('');
      onDone(`Added ${res.data.added}, updated ${res.data.updated}.`);
    } else setError(messageFor(res.error));
  };

  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h4>Add a closure</h4>
      <div className="field"><label htmlFor="cl-date">Date</label><input id="cl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="field"><label htmlFor="cl-kind">Kind</label><KindSelect id="cl-kind" value={kind} onChange={setKind} /></div>
      <div className="field"><label htmlFor="cl-reason">Reason</label><input id="cl-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="row"><button type="submit">Add closure</button></div>
    </form>
  );
}

function PasteMany({ onDone }: { onDone: (msg: string) => void }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ClosureKind>('class_day');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseClosureLines(text, kind), [text, kind]);

  const submit = async () => {
    if (parsed.rows.length === 0) return;
    setBusy(true);
    const res = await api.adminAddClosures(parsed.rows);
    setBusy(false);
    if (res.ok) {
      setError(null);
      setText('');
      onDone(`Added ${res.data.added}, updated ${res.data.updated}.`);
    } else setError(messageFor(res.error));
  };

  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h4>Paste many</h4>
      <p className="muted">One per line: YYYY-MM-DD or YYYY-MM-DD, reason. Existing dates are updated.</p>
      <div className="field"><label htmlFor="paste-text">Dates</label><textarea id="paste-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="field"><label htmlFor="paste-kind">Kind for all</label><KindSelect id="paste-kind" value={kind} onChange={setKind} /></div>
      {text.trim() ? (
        <div aria-label="Preview" role="group" className="stack">
          <p>{parsed.rows.length} valid, {parsed.invalid.length} invalid.</p>
          {parsed.rows.length ? (
            <ul>{parsed.rows.map((r) => <li key={r.date}>{r.date} - {KIND_LABELS[r.kind]}{r.reason ? ` - ${r.reason}` : ''}</li>)}</ul>
          ) : null}
          {parsed.invalid.length ? (
            <ul className="error">{parsed.invalid.map((l) => <li key={l.line}>Line {l.line} is not valid: {l.text}</li>)}</ul>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="row"><button type="submit" disabled={busy || parsed.rows.length === 0}>Add {parsed.rows.length || ''} closures</button></div>
    </form>
  );
}
