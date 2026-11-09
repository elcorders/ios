import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../api';
import type { Closure, ClosureKind } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { Dialog } from '../Dialog';
import { KIND_BLOCKS, KIND_LABELS, addDaysIso, colomboToday, isValidDate, parseClosureLines } from './labHelpers';
import '../table/table.css';

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
      {KIND_BLOCKS.map((blk) => (
        <KindBlock
          key={blk.kind}
          kind={blk.kind}
          rows={rows ? rows.filter((c) => c.kind === blk.kind) : null}
          past={past}
          onDelete={setDeleting}
          onDone={(m) => { setNotice(m); void load(); }}
        />
      ))}
      {deleting ? (
        <Dialog title="Delete closure" submitLabel="Delete" onCancel={() => setDeleting(null)} onSubmit={() => void remove()}>
          <p>Delete the {KIND_LABELS[deleting.kind].toLowerCase()} on {deleting.date}?</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function KindBlock({ kind, rows, past, onDelete, onDone }: {
  kind: ClosureKind; rows: Closure[] | null; past: boolean; onDelete: (c: Closure) => void; onDone: (msg: string) => void;
}) {
  const blk = KIND_BLOCKS.find((b) => b.kind === kind)!;
  const when = past ? 'past' : 'upcoming';
  return (
    <section className="stack" aria-labelledby={`blk-${kind}`}>
      <h4 id={`blk-${kind}`}>{blk.title}</h4>
      {rows ? (
        <div className="table-wrap admin-table">
          <table>
            <caption className="sr-only">{`${past ? 'Past' : 'Upcoming'} ${blk.noun}`}</caption>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Reason</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="c-name">{c.date}</td>
                  <td className="c-wide">{c.reason ?? ''}</td>
                  <td className="c-actions">
                    <button type="button" aria-label={`Delete ${blk.single} ${c.date}`} onClick={() => onDelete(c)}>Delete</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={3}>No {when} {blk.noun}.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      <AddOne kind={kind} onDone={onDone} />
      <PasteMany kind={kind} onDone={onDone} />
    </section>
  );
}

function AddOne({ kind, onDone }: { kind: ClosureKind; onDone: (msg: string) => void }) {
  const blk = KIND_BLOCKS.find((b) => b.kind === kind)!;
  const [date, setDate] = useState('');
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
    <form className="card stack" aria-label={`Add ${blk.single}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h5>Add one</h5>
      <div className="field"><label htmlFor={`cl-date-${kind}`}>Date ({blk.single})</label><input id={`cl-date-${kind}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="field"><label htmlFor={`cl-reason-${kind}`}>Reason ({blk.single})</label><input id={`cl-reason-${kind}`} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="row"><button type="submit">Add {blk.single}</button></div>
    </form>
  );
}

function PasteMany({ kind, onDone }: { kind: ClosureKind; onDone: (msg: string) => void }) {
  const blk = KIND_BLOCKS.find((b) => b.kind === kind)!;
  const [text, setText] = useState('');
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
    <form className="card stack" aria-label={`Paste many ${blk.noun}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h5>Paste many</h5>
      <p className="muted">One per line: YYYY-MM-DD or YYYY-MM-DD, reason. Existing dates are updated.</p>
      <div className="field"><label htmlFor={`paste-${kind}`}>Dates ({blk.noun})</label><textarea id={`paste-${kind}`} rows={4} value={text} onChange={(e) => setText(e.target.value)} /></div>
      {text.trim() ? (
        <div aria-label={`Preview ${blk.noun}`} role="group" className="stack">
          <p>{parsed.rows.length} valid, {parsed.invalid.length} invalid.</p>
          {parsed.rows.length ? (
            <ul>{parsed.rows.map((r) => <li key={r.date}>{r.date}{r.reason ? ` - ${r.reason}` : ''}</li>)}</ul>
          ) : null}
          {parsed.invalid.length ? (
            <ul className="error">{parsed.invalid.map((l) => <li key={l.line}>Line {l.line} is not valid: {l.text}</li>)}</ul>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="row"><button type="submit" disabled={busy || parsed.rows.length === 0}>Add {parsed.rows.length || ''} {blk.noun}</button></div>
    </form>
  );
}
