import { useEffect, useState } from 'react';
import { api } from '../../../api';
import type { LabHours } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { WEEKDAYS, hourLabel, hourOf } from './labHelpers';

interface DayRow { closed: boolean; open: number; close: number }
const OPTIONS = Array.from({ length: 17 }, (_, i) => 6 + i); // 06..22

export function HoursTab() {
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void api.getLabHours().then((res) => {
      if (!live) return;
      if (!res.ok) return setError(messageFor(res.error));
      setRows(WEEKDAYS.map((_, i) => {
        const h = res.data.find((x) => x.weekday === i + 1);
        return h ? { closed: false, open: hourOf(h.open_time), close: hourOf(h.close_time) } : { closed: true, open: 9, close: 19 };
      }));
    });
    return () => { live = false; };
  }, []);

  if (error && !rows) return <p role="alert" className="error">{error}</p>;
  if (!rows) return <p role="status">Loading…</p>;

  const patch = (i: number, p: Partial<DayRow>) => {
    setSaved(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  };
  const invalidDay = rows.findIndex((r) => !r.closed && r.open >= r.close);

  const save = async () => {
    if (invalidDay >= 0) return;
    setBusy(true);
    const hours: LabHours[] = rows.flatMap((r, i) => (r.closed ? [] : [{ weekday: i + 1, open_time: hourLabel(r.open), close_time: hourLabel(r.close) }]));
    const res = await api.adminSetLabHours(hours);
    setBusy(false);
    if (res.ok) {
      setError(null);
      setSaved(true);
    } else setError(messageFor(res.error));
  };

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <h3>Opening hours</h3>
      <p className="muted">Times are Asia/Colombo, whole hours. A closed weekday has no slots.</p>
      {rows.map((r, i) => {
        const day = WEEKDAYS[i]!;
        return (
          <fieldset key={day} className="row">
            <legend>{day}</legend>
            <label className="row">
              <input type="checkbox" aria-label={`${day} closed`} checked={r.closed} onChange={(e) => patch(i, { closed: e.target.checked })} /> Closed
            </label>
            <label>
              <span className="sr-only">{day} open</span>
              <select aria-label={`${day} open`} value={r.open} disabled={r.closed} onChange={(e) => patch(i, { open: Number(e.target.value) })}>
                {OPTIONS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </label>
            <span aria-hidden="true">to</span>
            <label>
              <span className="sr-only">{day} close</span>
              <select aria-label={`${day} close`} value={r.close} disabled={r.closed} onChange={(e) => patch(i, { close: Number(e.target.value) })}>
                {OPTIONS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </label>
            {!r.closed && r.open >= r.close ? <span role="alert" className="error">Opening must be before closing.</span> : null}
          </fieldset>
        );
      })}
      {error ? <p role="alert" className="error">{error}</p> : null}
      {saved ? <p role="status">Hours saved.</p> : null}
      <div className="row"><button type="submit" disabled={busy || invalidDay >= 0}>Save hours</button></div>
    </form>
  );
}
