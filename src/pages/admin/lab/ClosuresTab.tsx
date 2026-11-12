import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../api';
import type { Closure, ClosureKind } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { formatColombo } from '../../../lib/time';
import { Dialog } from '../Dialog';
import { KIND_BLOCKS, KIND_LABELS, addDaysIso, colomboToday, isValidDate, parseClosureLines } from './labHelpers';
import '../table/table.css';

const fmtShort = (d: string) => formatColombo(`${d}T12:00:00+05:30`, { day: '2-digit', month: 'short' });

export function ClosuresTab() {
  const today = useMemo(() => colomboToday(), []);
  const [past, setPast] = useState(false);
  const [rows, setRows] = useState<Closure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Closure | null>(null);
  const [deletingRange, setDeletingRange] = useState<Closure | null>(null);

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

  const rangeSpan = (c: Closure): { first: string; last: string } | null => {
    if (!c.range_id) return null;
    const dates = (rows ?? []).filter((r) => r.range_id === c.range_id).map((r) => r.date).sort();
    return dates.length ? { first: dates[0]!, last: dates[dates.length - 1]! } : null;
  };

  const removeRange = async () => {
    if (!deletingRange) return;
    const res = await api.adminDeleteClosure(deletingRange.id, true);
    setDeletingRange(null);
    if (res.ok) {
      setNotice(`Range deleted (${res.data.deleted} days).`);
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
          onDeleteRange={setDeletingRange}
          rangeSpan={rangeSpan}
          onDone={(m) => { setNotice(m); void load(); }}
        />
      ))}
      {deleting ? (
        <Dialog title="Delete closure" submitLabel="Delete" onCancel={() => setDeleting(null)} onSubmit={() => void remove()}>
          <p>Delete the {KIND_LABELS[deleting.kind].toLowerCase()} on {deleting.date}?</p>
        </Dialog>
      ) : null}
      {deletingRange ? (
        <Dialog title="Delete range" submitLabel="Delete range" onCancel={() => setDeletingRange(null)} onSubmit={() => void removeRange()}>
          <p>
            Delete every {KIND_LABELS[deletingRange.kind].toLowerCase()} in the range
            {rangeSpan(deletingRange) ? ` ${fmtShort(rangeSpan(deletingRange)!.first)} – ${fmtShort(rangeSpan(deletingRange)!.last)}` : ''}?
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}

function KindBlock({ kind, rows, past, onDelete, onDeleteRange, rangeSpan, onDone }: {
  kind: ClosureKind; rows: Closure[] | null; past: boolean; onDelete: (c: Closure) => void; onDeleteRange: (c: Closure) => void;
  rangeSpan: (c: Closure) => { first: string; last: string } | null; onDone: (msg: string) => void;
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
                  <td className="c-wide">
                    {c.reason ?? ''}
                    {rangeSpan(c) ? (
                      <small className="muted"> part of range {fmtShort(rangeSpan(c)!.first)} – {fmtShort(rangeSpan(c)!.last)}</small>
                    ) : null}
                  </td>
                  <td className="c-actions">
                    <button type="button" aria-label={`Delete ${blk.single} ${c.date}`} onClick={() => onDelete(c)}>Delete</button>
                    {c.range_id ? (
                      <button type="button" aria-label={`Delete range of ${blk.single} ${c.date}`} onClick={() => onDeleteRange(c)}>Delete range</button>
                    ) : null}
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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidDate(from)) return setError('Choose a From date.');
    if (to && !isValidDate(to)) return setError('Choose a valid To date.');
    if (to && to < from) return setError('To must be on or after From.');
    const text = reason.trim() || null;
    const res = !to || to === from
      ? await api.adminAddClosures([{ date: from, kind, reason: text }])
      : await api.adminAddClosureRange({ from, to, kind, reason: text });
    if (res.ok) {
      setError(null);
      setFrom('');
      setTo('');
      setReason('');
      onDone(`Added ${res.data.added}, updated ${res.data.updated}.`);
    } else setError(messageFor(res.error));
  };

  return (
    <form className="card stack" aria-label={`Add ${blk.single}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h5>Add one day or a range</h5>
      <div className="field"><label htmlFor={`cl-from-${kind}`}>From ({blk.single})</label><input id={`cl-from-${kind}`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div className="field"><label htmlFor={`cl-to-${kind}`}>To ({blk.single}, optional)</label><input id={`cl-to-${kind}`} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
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
