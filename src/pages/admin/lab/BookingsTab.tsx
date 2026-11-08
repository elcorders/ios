import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api';
import type { LabBookingRow } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { formatColombo } from '../../../lib/time';
import { colomboToday, isValidDate } from './labHelpers';

const timeOnly: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

export function BookingsTab() {
  const [date, setDate] = useState(colomboToday);
  const [rows, setRows] = useState<LabBookingRow[] | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isValidDate(date)) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while loading a new day
    setRows(null);
    void Promise.all([api.adminListLabBookings(date, date), api.getLabCalendar(date, date)]).then(([b, c]) => {
      if (!live) return;
      if (!b.ok) return setError(messageFor(b.error));
      setError(c.ok ? null : messageFor(c.error));
      setCapacity(c.ok ? c.data.capacity : null);
      setRows(b.data);
    });
    return () => { live = false; };
  }, [date]);

  const groups = useMemo(() => {
    const m = new Map<string, LabBookingRow[]>();
    for (const r of rows ?? []) m.set(r.slot_start, [...(m.get(r.slot_start) ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="stack">
      <h3>Bookings</h3>
      <div className="field">
        <label htmlFor="bk-date">Date</label>
        <input id="bk-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {!rows && !error ? <p role="status">Loading…</p> : null}
      {rows && groups.length === 0 ? <p>No bookings on {date}.</p> : null}
      {groups.map(([start, list]) => {
        const count = list.filter((r) => r.status !== 'withdrawn').length;
        const over = capacity !== null && count > capacity;
        const label = formatColombo(start, timeOnly);
        return (
          <section key={start} className={`card stack${over ? ' over-capacity' : ''}`} aria-label={`Slot ${label}`}
            style={over ? { borderColor: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}>
            <h4>
              {label} <span className="badge">{count}{capacity !== null ? ` / ${capacity}` : ''}</span>
              {over ? <span role="status" className="error"> Over capacity</span> : null}
            </h4>
            <div className="table-wrap admin-table">
              <table>
                <caption className="sr-only">Bookings at {label}</caption>
                <thead>
                  <tr><th scope="col">Name</th><th scope="col">Index</th><th scope="col">Group</th><th scope="col">Preferred Mac</th><th scope="col">Status</th></tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td className="c-name">{r.first_name} {r.last_name}</td>
                      <td className="c-index c-mono">{r.index_no ?? ''}</td>
                      <td className="c-group" data-set={r.group_no !== null ? '' : undefined}>{r.group_no ?? '—'}</td>
                      <td className="c-wide">{r.preferred_mac_no !== null ? `Mac ${r.preferred_mac_no}` : 'No preference'}</td>
                      <td className="c-status">{r.status.replace('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
