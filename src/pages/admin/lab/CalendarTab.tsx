import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import type { IsoDate, LabCalendar, LabDay } from '../../../api/types';
import { messageFor } from '../../../lib/errors';
import { formatColombo } from '../../../lib/time';
import { colomboToday } from './labHelpers';
import { LEVEL_LABEL, blockText } from './levels';
import '../../lab.css';
import './calendar.css';

const WEEKDAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CLOSURE_LABEL = { holiday: 'Holiday', closed: 'NIBM closed', class_day: 'Class day' } as const;
const timeOnly: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };

const monthStart = (d: IsoDate) => `${d.slice(0, 7)}-01`;
const shiftMonth = (first: IsoDate, n: number): IsoDate => {
  const t = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 + n, 1));
  return t.toISOString().slice(0, 10);
};
const monthEnd = (first: IsoDate): IsoDate => new Date(Date.parse(`${shiftMonth(first, 1)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const monthLabel = (first: IsoDate) => formatColombo(`${first}T12:00:00+05:30`, { month: 'long', year: 'numeric' });
const dayLong = (d: IsoDate) => formatColombo(`${d}T12:00:00+05:30`, { weekday: 'long', day: 'numeric', month: 'long' });
const dayShort = (d: IsoDate) => formatColombo(`${d}T12:00:00+05:30`, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');

/** Admin › Lab › Calendar: month grid of booked / capacity with fullness levels; click a day for the hour rows. */
export function CalendarTab() {
  const today = useMemo(() => colomboToday(), []);
  const [month, setMonth] = useState<IsoDate>(() => monthStart(today));
  const [cal, setCal] = useState<LabCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IsoDate | null>(null);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while loading a new month
    setCal(null);
    void api.getLabCalendar(month, monthEnd(month)).then((res) => {
      if (!live) return;
      if (res.ok) {
        setCal(res.data);
        setError(null);
      } else setError(messageFor(res.error));
    });
    return () => { live = false; };
  }, [month]);

  const days = cal?.days ?? [];
  const pad = days.length ? days[0]!.weekday - 1 : 0;
  const detail = days.find((d) => d.date === selected) ?? null;

  return (
    <div className="stack">
      <h3>Calendar</h3>
      <div className="cal-nav row">
        <button type="button" onClick={() => { setSelected(null); setMonth(shiftMonth(month, -1)); }} aria-label="Previous month">‹ Prev</button>
        <strong role="heading" aria-level={4} aria-live="polite">{monthLabel(month)}</strong>
        <button type="button" onClick={() => { setSelected(null); setMonth(shiftMonth(month, 1)); }} aria-label="Next month">Next ›</button>
        {month !== monthStart(today) ? (
          <button type="button" onClick={() => { setSelected(null); setMonth(monthStart(today)); }}>This month</button>
        ) : null}
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {!cal && !error ? <p role="status">Loading…</p> : null}
      {cal ? (
        <>
          <p className="muted">
            {cal.capacity !== null ? `${cal.capacity} ${cal.capacity === 1 ? 'Mac' : 'Macs'} in service. ` : ''}
            Each day shows bookings / seats over the hours that are not blocked by a class.
          </p>
          <div className="cal-heads" aria-hidden="true">{WEEKDAY_HEADS.map((w) => <span key={w}>{w}</span>)}</div>
          <ul className="cal-grid" aria-label={`Lab calendar ${monthLabel(month)}`}>
            {Array.from({ length: pad }, (_, i) => <li key={`pad-${i}`} className="cal-pad" aria-hidden="true" />)}
            {days.map((d) => (
              <li key={d.date}>
                <DayCell day={d} today={d.date === today} selected={d.date === selected} onPick={() => setSelected(d.date === selected ? null : d.date)} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {detail ? <DayDetail day={detail} capacity={cal?.capacity ?? null} /> : null}
    </div>
  );
}

function summaryOf(d: LabDay): string {
  if (d.closure) return d.closure.reason ? `${CLOSURE_LABEL[d.closure.kind]}: ${d.closure.reason}` : CLOSURE_LABEL[d.closure.kind];
  if (!d.open) return 'Closed';
  return '';
}

function DayCell({ day: d, today, selected, onPick }: { day: LabDay; today: boolean; selected: boolean; onPick: () => void }) {
  const closed = !d.open;
  const block = blockText(d.block_until, 'Class (whole day)');
  const pct = d.slot_capacity ? Math.min(100, Math.round(((d.booked ?? 0) / d.slot_capacity) * 100)) : 0;
  const closureText = summaryOf(d);
  const label = [
    dayShort(d.date),
    today ? 'today' : null,
    closureText || null,
    block,
    d.level && d.booked !== null && d.slot_capacity !== null ? `${d.booked} of ${d.slot_capacity} booked, ${LEVEL_LABEL[d.level]}` : null,
  ].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      className={`cal-cell${closed ? ' cal-cell-closed' : ''}${today ? ' cal-cell-today' : ''}`}
      aria-label={label}
      aria-pressed={selected}
      aria-current={today ? 'date' : undefined}
      onClick={onPick}
    >
      <span className="cal-date">
        <span className="cal-num">{Number(d.date.slice(8))}</span>
        <span className="cal-wd">{dayShort(d.date)}</span>
        {today ? <span className="cal-today">Today</span> : null}
      </span>
      {closureText ? <span className="cal-note">{closureText}</span> : null}
      {block ? <span className="cal-note cal-block">{block}</span> : null}
      {d.open && d.level ? (
        <>
          <span className="cal-count">{d.booked ?? 0} / {d.slot_capacity ?? 0}</span>
          <span className="cal-bar" aria-hidden="true"><span className={`cal-fill cal-fill-${d.level}`} style={{ width: `${pct}%` }} /></span>
          <span className={`lab-level lab-level-${d.level}`}>{LEVEL_LABEL[d.level]}</span>
        </>
      ) : null}
    </button>
  );
}

function DayDetail({ day, capacity }: { day: LabDay; capacity: number | null }) {
  const block = blockText(day.block_until, 'Class (whole day)');
  return (
    <section className="card stack" aria-label={`Details for ${dayLong(day.date)}`}>
      <h4>{dayLong(day.date)}</h4>
      {summaryOf(day) ? <p>{summaryOf(day)}</p> : null}
      {block ? <p>{block}</p> : null}
      {day.slots.length === 0 ? <p className="muted">No lab hours on this day.</p> : (
        <ul className="cal-hours" aria-label="Hours">
          {day.slots.map((s) => (
            <li key={s.start} className={s.blocked ? 'cal-hour-blocked' : undefined}>
              <span className="lab-slot-time">{formatColombo(s.start, timeOnly)}</span>
              <span>{s.booked ?? 0}{capacity !== null ? ` / ${capacity}` : ''}</span>
              {s.blocked ? <span className="muted">Class (blocked)</span> : s.level ? <span className={`lab-level lab-level-${s.level}`}>{LEVEL_LABEL[s.level]}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <Link to={`/admin/lab/bookings?date=${day.date}`}>Open this day in Bookings</Link>
      </div>
    </section>
  );
}
