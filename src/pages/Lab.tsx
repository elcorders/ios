import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { ApiError, BookWarning, Booking, IsoDate, IsoDateTime, LabCalendar, LabDay, MyLab } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { messageFor } from '../lib/errors';
import { formatColombo } from '../lib/time';
import { Dialog } from './admin/Dialog';
import { LEVEL_LABEL, blockText, isClassDay } from './admin/lab/levels';
import './lab.css';

const MAX_PICK = 13;
const COLOMBO_OFFSET_MS = 5.5 * 3600_000;
const colomboToday = (): IsoDate => new Date(Date.now() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);

const timeOnly: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const dayLong: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
const dayTime: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const fmtTime = (iso: IsoDateTime) => formatColombo(iso, timeOnly);
const fmtDayTime = (iso: IsoDateTime) => formatColombo(iso, dayTime).replace(/,/g, '');
const fmtDay = (d: IsoDate) => formatColombo(`${d}T12:00:00+05:30`, dayLong).replace(/,/g, '');
const fmtDate = (d: IsoDate) => formatColombo(`${d}T12:00:00+05:30`, { day: 'numeric', month: 'short' });

const CLOSURE_LABEL = { holiday: 'Holiday', closed: 'Closed', class_day: 'Class day' } as const;

function errorText(error: ApiError): string {
  const base = messageFor(error);
  const at = (error.details as { slot_start?: unknown } | undefined)?.slot_start;
  return typeof at === 'string' ? `${base} (${fmtDayTime(at)})` : base;
}

const STATUS_LABEL: Record<Booking['status'], string> = {
  booked: 'Booked',
  withdrawn: 'Withdrawn',
  checked_in: 'Checked in',
  completed: 'Completed',
  no_show: 'Missed',
};

const REASON_TEXT: Record<string, string> = {
  has_mac: 'Lab booking is for students who do not have a Mac of their own. Your survey answer says you have one.',
  no_survey: 'Answer the quick Mac question on Home first, then lab booking opens up.',
  lab_closed: 'Lab booking is not open yet.',
  suspended: 'Your lab booking is paused after missed sessions. Ask an instructor to clear it.',
  not_student: 'Lab booking is for students only.',
};

export function Lab() {
  const { me } = useAuth();
  const enrolment = me?.enrolments.find((e) => e.role === 'student' && e.status === 'active' && e.cohort_status === 'active');
  const cohortId = enrolment?.cohort_id;

  const [now, setNow] = useState(() => Date.now());
  const [lab, setLab] = useState<MyLab | null>(null);
  const [calendar, setCalendar] = useState<LabCalendar | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [day, setDay] = useState<IsoDate | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [withdrawing, setWithdrawing] = useState<Booking | null>(null);
  const [macPrompt, setMacPrompt] = useState(false);
  const [macChoice, setMacChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ count: number; warnings: BookWarning[] } | null>(null);
  const [params] = useSearchParams();
  const wantedBooking = params.get('b');
  const opened = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!cohortId) return;
    const res = await api.getMyLab(cohortId);
    setNow(Date.now());
    if (!res.ok) {
      setLoadError(errorText(res.error));
      return;
    }
    setLab(res.data);
    setLoadError(null);
    if (res.data.eligible) {
      const cal = await api.getLabCalendar(colomboToday(), res.data.horizon_end);
      if (cal.ok) setCalendar(cal.data);
      else setLoadError(errorText(cal.error));
    } else {
      setCalendar(null);
    }
  }, [cohortId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load on mount
    void load();
  }, [load]);

  // Deep link from a reminder: /#/lab?b=<booking id> scrolls to it and opens the Withdraw confirm.
  useEffect(() => {
    if (!wantedBooking || !lab || opened.current === wantedBooking) return;
    const b = lab.bookings.find((x) => x.id === wantedBooking);
    if (!b) return;
    opened.current = wantedBooking;
    document.getElementById(`booking-${b.id}`)?.scrollIntoView?.({ block: 'center' });
    if (b.status === 'booked' && Date.parse(b.slot_start) > Date.now()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time open from the link
      setWithdrawing(b);
    }
  }, [wantedBooking, lab]);

  const days = useMemo(() => calendar?.days ?? [], [calendar]);
  const activeDay = useMemo(() => {
    if (day && days.some((d) => d.date === day)) return day;
    return (days.find((d) => d.open) ?? days[0])?.date ?? null;
  }, [day, days]);
  const dayData = days.find((d) => d.date === activeDay) ?? null;
  const myStarts = new Set((lab?.bookings ?? []).filter((b) => b.status !== 'withdrawn').map((b) => Date.parse(b.slot_start)));

  if (!me) return null;
  if ((!enrolment || !cohortId) && me.is_admin) return <AdminLabPreview />;
  if (!enrolment || !cohortId) {
    return (
      <section className="card stack">
        <h1>Lab booking</h1>
        <p>There is no active class for you here.</p>
      </section>
    );
  }
  if (loadError && !lab) {
    return (
      <section className="card stack">
        <h1>Lab booking</h1>
        <p role="alert" className="error">{loadError}</p>
      </section>
    );
  }
  if (!lab) return <p role="status">Loading…</p>;

  const toggle = (start: string) =>
    setPicked((p) => (p.includes(start) ? p.filter((s) => s !== start) : p.length < MAX_PICK ? [...p, start] : p));
  const sortedPicked = [...picked].sort();

  async function book(starts: string[], fromDialog: boolean) {
    if (!cohortId) return;
    setBusy(true);
    setDialogError(null);
    setPageError(null);
    const res = await api.bookSlots(cohortId, starts);
    setBusy(false);
    if (res.ok) {
      setConfirming(false);
      setPicked([]);
      setNotice({ count: res.data.bookings.length, warnings: res.data.warnings });
      const prevNeeds = lab?.needs_preferred_mac;
      await load();
      const fresh = await api.getMyLab(cohortId);
      if (fresh.ok && fresh.data.needs_preferred_mac && !prevNeeds) {
        setMacChoice('');
        setMacPrompt(true);
      }
    } else {
      const text = errorText(res.error);
      if (fromDialog) setDialogError(text);
      else setPageError(text);
      await load();
      if (res.error.code === 'slot_full' || res.error.code === 'slot_past' || res.error.code === 'slot_closed') {
        setPicked((p) => p.filter((s) => s !== (res.error.details as { slot_start?: string } | undefined)?.slot_start));
      }
    }
  }

  async function withdraw() {
    if (!withdrawing) return;
    setBusy(true);
    setDialogError(null);
    const res = await api.withdrawBooking(withdrawing.id);
    setBusy(false);
    if (res.ok) {
      setWithdrawing(null);
      setNotice(null);
      await load();
    } else {
      setDialogError(errorText(res.error));
      await load();
    }
  }

  async function savePreferred() {
    if (!cohortId) return;
    setBusy(true);
    setDialogError(null);
    const res = await api.setPreferredMac(cohortId, macChoice === '' ? null : macChoice);
    setBusy(false);
    if (res.ok) {
      setMacPrompt(false);
      await load();
    } else {
      setDialogError(errorText(res.error));
    }
  }

  const upcoming = lab.bookings.filter((b) => b.status !== 'withdrawn');
  const atMax = picked.length >= MAX_PICK;

  return (
    <section className="stack-lg lab-page">
      <div className="card stack">
        <h1>Lab booking</h1>
        <Link to="/">Back to Home</Link>
        {!lab.eligible ? (
          <p role="status" className="lab-reason">{REASON_TEXT[lab.reason ?? 'not_student']}</p>
        ) : (
          <>
            <dl className="lab-stats">
              <div><dt>Credits left</dt><dd>{lab.credits.remaining} of {lab.credits.allowance}</dd></div>
              <div><dt>This week</dt><dd>{lab.week.hours} of {lab.week.cap} hours</dd></div>
              <div><dt>Credit period</dt><dd>{fmtDate(lab.cycle.start)} to {fmtDate(lab.cycle.end)}</dd></div>
            </dl>
            {lab.credits.penalty > 0 ? (
              <p className="muted lab-penalty">
                −{lab.credits.penalty} credits for {lab.no_shows} missed {lab.no_shows === 1 ? 'booking' : 'bookings'}. Attend your next booking to get them back.
              </p>
            ) : null}
            <p className="muted lab-pref">
              Preferred Mac: <strong>{lab.preferred_mac_no ? `Mac ${lab.preferred_mac_no}` : 'No preference'}</strong>{' '}
              <button type="button" className="inline" onClick={() => { setMacChoice(lab.preferred_mac_id ?? ''); setDialogError(null); setMacPrompt(true); }}>
                Change
              </button>
            </p>
          </>
        )}
      </div>

      {lab.eligible ? (
        <div className="card stack">
          <h2>Pick your times</h2>
          <p className="muted">Times are Sri Lanka time. You can book up to {MAX_PICK} slots at once.</p>
          <div className="lab-days" role="group" aria-label="Day">
            {days.map((d) => {
              const label = fmtDay(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  className={`lab-day${d.open ? '' : ' lab-day-closed'}`}
                  aria-pressed={d.date === activeDay}
                  onClick={() => setDay(d.date)}
                >
                  <span>{label}</span>
                  <DayChip day={d} />
                </button>
              );
            })}
          </div>

          {dayData && !dayData.open ? (
            <p className="muted" role="status">
              The lab is closed on {fmtDay(dayData.date)}
              {dayData.closure?.reason ? `: ${dayData.closure.reason}` : dayData.closure ? `: ${CLOSURE_LABEL[dayData.closure.kind]}` : ''}.
            </p>
          ) : null}

          {dayData && dayData.open ? (
            <ul className="lab-slots" aria-label={`Slots on ${fmtDay(dayData.date)}`}>
              {dayData.slots.map((s) => {
                const past = Date.parse(s.start) <= now;
                const mine = myStarts.has(Date.parse(s.start));
                const checked = picked.includes(s.start);
                const off = past || s.full || s.blocked || mine || (!checked && atMax);
                const status = mine
                  ? 'Booked by you'
                  : s.blocked
                    ? (blockText(dayData.block_until) ?? 'Class')
                    : past
                      ? 'Past'
                      : s.level
                        ? LEVEL_LABEL[s.level]
                        : '';
                return (
                  <li key={s.start}>
                    <label className={`lab-slot${off ? ' lab-slot-off' : ''}`}>
                      <input type="checkbox" checked={checked} disabled={off} onChange={() => toggle(s.start)} />
                      <span className="lab-slot-time">{fmtTime(s.start)} to {fmtTime(s.end)}</span>
                      {s.level && !mine && !past && !s.blocked ? (
                        <span className={`lab-level lab-level-${s.level}`}>{status}</span>
                      ) : (
                        <span className="lab-slot-status muted">{status}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {pageError ? <p role="alert" className="error">{pageError}</p> : null}
          <div className="lab-bar">
            <span aria-live="polite">{picked.length} selected</span>
            <button type="button" className="primary" disabled={picked.length === 0 || busy} onClick={() => { setDialogError(null); setConfirming(true); }}>
              Book {picked.length || ''} {picked.length === 1 ? 'slot' : 'slots'}
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="card stack" role="status" aria-label="Booking result">
          <h2>{notice.count === 1 ? 'Booked 1 slot' : `Booked ${notice.count} slots`}</h2>
          {notice.warnings.map((w) => (
            <div key={w.slot_start} className="lab-warning stack">
              <p>
                Someone else who prefers the same Mac is booked at {fmtDayTime(w.slot_start)}. You can keep it, or move to a different time.
              </p>
              {w.suggestions.length > 0 ? (
                <div className="row">
                  {w.suggestions.map((s) => (
                    <button key={s} type="button" disabled={busy} onClick={() => void book([s], false)} aria-label={`Also book ${fmtDayTime(s)}`}>
                      {fmtTime(s)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="card stack">
        <h2>My bookings</h2>
        {upcoming.length === 0 ? (
          <p className="muted">No bookings in this credit period.</p>
        ) : (
          <ul className="lab-bookings" aria-label="My bookings">
            {upcoming.map((b) => {
              const future = Date.parse(b.slot_start) > now;
              return (
                <li key={b.id} id={`booking-${b.id}`} className={b.id === wantedBooking ? 'lab-booking-target' : undefined}>
                  <span>
                    <strong>{fmtDayTime(b.slot_start)}</strong> to {fmtTime(b.slot_end)}
                    {b.preferred_mac_no ? <span className="muted"> · Mac {b.preferred_mac_no}</span> : null}
                  </span>
                  <span className="badge">{STATUS_LABEL[b.status]}</span>
                  {b.status === 'booked' && future ? (
                    <button type="button" aria-label={`Withdraw booking ${fmtDayTime(b.slot_start)}`} onClick={() => { setDialogError(null); setWithdrawing(b); }}>
                      Withdraw
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirming ? (
        <Dialog
          title={`Book ${sortedPicked.length} ${sortedPicked.length === 1 ? 'slot' : 'slots'}?`}
          submitLabel="Confirm booking"
          busy={busy}
          error={dialogError}
          onCancel={() => setConfirming(false)}
          onSubmit={() => void book(sortedPicked, true)}
        >
          <ul className="lab-confirm">
            {sortedPicked.map((s) => <li key={s}>{fmtDayTime(s)}</li>)}
          </ul>
          <p className="muted">Each slot uses 1 credit. You can withdraw before it starts and get the credit back.</p>
        </Dialog>
      ) : null}

      {withdrawing ? (
        <Dialog
          title="Withdraw this booking?"
          submitLabel="Withdraw"
          busy={busy}
          error={dialogError}
          onCancel={() => setWithdrawing(null)}
          onSubmit={() => void withdraw()}
        >
          <p>{fmtDayTime(withdrawing.slot_start)}. The credit goes back to you.</p>
        </Dialog>
      ) : null}

      {macPrompt ? (
        <Dialog
          title="Preferred Mac"
          submitLabel="Save"
          busy={busy}
          error={dialogError}
          onCancel={() => setMacPrompt(false)}
          onSubmit={() => void savePreferred()}
        >
          <p>Pick the Mac you like to work on. It is only a wish: you may be seated at another one.</p>
          <label className="stack">
            Preferred Mac
            <select value={macChoice} onChange={(e) => setMacChoice(e.target.value)}>
              <option value="">No preference</option>
              {lab.macs.map((m) => (
                <option key={m.id} value={m.id}>Mac {m.no}{m.label ? ` (${m.label})` : ''}</option>
              ))}
            </select>
          </label>
        </Dialog>
      ) : null}
    </section>
  );
}

function DayChip({ day }: { day: LabDay }) {
  if (day.closure) return <small>{CLOSURE_LABEL[day.closure.kind]}</small>;
  if (!day.open) return <small>Closed</small>;
  if (isClassDay(day)) return <small>Class day</small>;
  return day.level ? <small className={`lab-level lab-level-${day.level}`}>{LEVEL_LABEL[day.level]}</small> : null;
}

/** Admin without a student enrolment: what students see, read-only (no booking — bookings belong to a student enrolment). */
function AdminLabPreview() {
  const [calendar, setCalendar] = useState<LabCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<IsoDate | null>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const today = colomboToday();
    const end = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
    void api.getLabCalendar(today, end).then((res) => {
      if (res.ok) setCalendar(res.data);
      else setError(errorText(res.error));
    });
  }, []);
  const days = calendar?.days ?? [];
  const activeDay = day && days.some((d) => d.date === day) ? day : ((days.find((d) => d.open) ?? days[0])?.date ?? null);
  const dayData = days.find((d) => d.date === activeDay) ?? null;
  return (
    <section className="stack-lg lab-page">
      <div className="card stack">
        <h1>Lab booking</h1>
        <Link to="/">Back to Home</Link>
        <p role="status" className="lab-reason">
          Admin preview: this is the calendar students see. Booking needs a student account. Manage Macs, hours and closures in <Link to="/admin/lab">Admin › Lab</Link>.
        </p>
        {error ? <p role="alert" className="error">{error}</p> : null}
        {calendar && calendar.capacity !== null ? <p className="muted">{calendar.capacity} {calendar.capacity === 1 ? 'Mac' : 'Macs'} in service.</p> : null}
      </div>
      {calendar ? (
        <div className="card stack">
          <h2>Calendar</h2>
          <div className="lab-days" role="group" aria-label="Day">
            {days.map((d) => {
              return (
                <button key={d.date} type="button" className={`lab-day${d.open ? '' : ' lab-day-closed'}`} aria-pressed={d.date === activeDay} onClick={() => setDay(d.date)}>
                  <span>{fmtDay(d.date)}</span>
                  <DayChip day={d} />
                </button>
              );
            })}
          </div>
          {dayData && !dayData.open ? (
            <p className="muted" role="status">
              The lab is closed on {fmtDay(dayData.date)}
              {dayData.closure?.reason ? `: ${dayData.closure.reason}` : dayData.closure ? `: ${CLOSURE_LABEL[dayData.closure.kind]}` : ''}.
            </p>
          ) : null}
          {dayData && dayData.open ? (
            <ul className="lab-slots" aria-label={`Slots on ${fmtDay(dayData.date)}`}>
              {dayData.slots.map((s) => {
                const past = Date.parse(s.start) <= now;
                return (
                  <li key={s.start}>
                    <div className={`lab-slot${past || s.full || s.blocked ? ' lab-slot-off' : ''}`}>
                      <span className="lab-slot-time">{fmtTime(s.start)} to {fmtTime(s.end)}</span>
                      {s.blocked ? (
                        <span className="lab-slot-status muted">{blockText(dayData.block_until) ?? 'Class'}</span>
                      ) : past ? (
                        <span className="lab-slot-status muted">Past</span>
                      ) : s.level ? (
                        <span className={`lab-level lab-level-${s.level}`}>{LEVEL_LABEL[s.level]}</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
