import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { KioskContent, KioskFeed, KioskLabHour, KioskPerson, KioskSession } from '../../api/types';
import { colomboDate, colomboHM, withinHours } from '../../lib/kiosk';
import { formatColombo } from '../../lib/time';
import { Logo } from './Logo';
import { useNow, useWakeLock } from './useKiosk';

/** Keep `?demo=` etc. when moving around inside the kiosk. */
export function useKioskTo() {
  const { search } = useLocation();
  return (pathname: string) => ({ pathname, search });
}

const groupsText = (g: number[]) => (g.length === 0 ? 'No groups' : `Group${g.length === 1 ? '' : 's'} ${g.join(', ')}`);
const dayText = (date: string, now: number) => {
  const today = colomboDate(now);
  if (date === today) return 'Today';
  if (date === colomboDate(now + 86_400_000)) return 'Tomorrow';
  return formatColombo(`${date}T12:00:00+05:30`, { weekday: 'long', day: 'numeric', month: 'short' });
};

export function KioskHeader({ feed, online, now }: { feed: KioskFeed | null; online: boolean; now: number }) {
  return (
    <header className="kiosk-header">
      <Logo />
      {feed?.cohort ? <span className="kiosk-chip">Cohort {feed.cohort.code}</span> : null}
      <span className="kiosk-spacer" />
      <span className="kiosk-device">{feed?.device.name ?? ''}</span>
      <span className={`kiosk-conn ${online ? 'on' : 'off'}`} role="status">
        <span className="dot" aria-hidden="true" />
        {online ? 'Connected' : 'Offline'}
      </span>
      <span className="kiosk-clock">
        <strong>{colomboHM(now)}</strong>
        <span>{formatColombo(new Date(now).toISOString(), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </span>
    </header>
  );
}

export function Board({ feed, online, skew }: { feed: KioskFeed | null; online: boolean; skew: number }) {
  const now = useNow(skew);
  useWakeLock(withinHours(now, feed?.lab_hours_today ?? null));
  return (
    <main className="kiosk kiosk-board">
      <KioskHeader feed={feed} online={online} now={now} />
      {!feed ? (
        <p role="status" className="kiosk-big muted kiosk-empty">Loading…</p>
      ) : !feed.cohort ? (
        <p className="kiosk-big kiosk-empty">No cohort selected for this screen.</p>
      ) : (
        <div className="kiosk-body">
          <section className="kiosk-main" aria-label="Class and lab">
            {feed.session_now ? (
              <ClassNow session={feed.session_now} />
            ) : (
              <>
                <NextClass session={feed.next_session} now={now} />
                <LabToday feed={feed} now={now} />
              </>
            )}
          </section>
          <ContentPanel content={feed.content} />
        </div>
      )}
    </main>
  );
}

function SlotList({ session, big = false }: { session: KioskSession; big?: boolean }) {
  return (
    <ul className={`slot-list${big ? ' big' : ''}`} aria-label="Time slots">
      {session.slots.map((s) => (
        <li key={`${s.start_time}-${s.end_time}`} className={s.now ? 'now' : undefined} aria-current={s.now ? 'time' : undefined}>
          <strong>{s.start_time}–{s.end_time}</strong>
          <span>{groupsText(s.group_nos)}</span>
          {s.now ? <span className="kiosk-badge">Now</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ClassNow({ session }: { session: KioskSession }) {
  const to = useKioskTo();
  return (
    <article className="kiosk-card class-now" aria-label="In class now">
      <p className="kiosk-eyebrow"><span className="pulse" aria-hidden="true" /> In class now</p>
      <h1 className="class-title">{session.title}</h1>
      <SlotList session={session} big />
      {session.deliverables.length > 0 ? (
        <>
          <h2>Bring / deliver</h2>
          <ul className="deliverables">
            {session.deliverables.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </>
      ) : null}
      {session.content.length > 0 ? (
        <>
          <h2>Open for this class</h2>
          <ul className="tile-row">
            {session.content.map((c) => (
              <li key={c.id}>
                {c.available ? (
                  <Link className="kiosk-tile" to={to(`/kiosk/c/${c.id}`)}>
                    <span className="tile-kind">{KIND_LABEL[c.kind]}</span>
                    <strong>{c.title}</strong>
                  </Link>
                ) : (
                  <div className="kiosk-tile disabled" aria-disabled="true">
                    <span className="tile-kind">{KIND_LABEL[c.kind]}</span>
                    <strong>{c.title}</strong>
                    <span className="muted">Not available yet</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

const KIND_LABEL = { tutorial: 'Tutorial', material: 'Class material', resource: 'Resource' } as const;

function NextClass({ session, now }: { session: KioskSession | null; now: number }) {
  return (
    <article className="kiosk-card next-class" aria-label="Next class">
      <p className="kiosk-eyebrow">Next class</p>
      {session ? (
        <div className="next-row">
          <div>
            <h2 className="next-title">{session.title}</h2>
            <p className="muted">{dayText(session.date, now)} · {formatColombo(`${session.date}T12:00:00+05:30`, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          </div>
          <SlotList session={session} />
        </div>
      ) : (
        <p className="kiosk-big muted">No class scheduled.</p>
      )}
    </article>
  );
}

function LabToday({ feed, now }: { feed: KioskFeed; now: number }) {
  const hours = feed.lab_hours_today;
  const closedWhy = feed.closure_today?.reason ?? null;
  return (
    <article className="kiosk-card lab-today" aria-label="Today in the lab">
      <div className="lab-head">
        <h2>Today in the lab</h2>
        {hours ? <span className="muted">{hours.open}–{hours.close}</span> : null}
      </div>
      {!hours || feed.lab_today.length === 0 ? (
        <p className="kiosk-big lab-closed">Lab closed today{closedWhy ? ` · ${closedWhy}` : ''}</p>
      ) : (
        <ul className="hour-grid">
          {feed.lab_today.map((h) => <HourCard key={h.start} hour={h} now={now} />)}
        </ul>
      )}
    </article>
  );
}

const MAX_CHIPS = 12;

function HourCard({ hour, now }: { hour: KioskLabHour; now: number }) {
  const start = Date.parse(hour.start);
  const end = Date.parse(hour.end);
  const state = now >= end ? 'past' : now >= start ? 'current' : 'future';
  const shown = hour.people.slice(0, MAX_CHIPS);
  const pct = hour.macs > 0 ? Math.min(100, Math.round((hour.booked / hour.macs) * 100)) : 0;
  return (
    <li className={`hour-card ${state}`} aria-current={state === 'current' ? 'time' : undefined}>
      <div className="hour-top">
        <strong>{colomboHM(start)}–{colomboHM(end)}</strong>
        {state === 'current' ? <span className="kiosk-badge">Now</span> : null}
        <span className="hour-count" aria-label={`${hour.booked} of ${hour.macs} Macs booked`}>{hour.booked}/{hour.macs}</span>
      </div>
      <div className="hour-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      {state === 'past' ? null : shown.length === 0 ? (
        <p className="muted hour-empty">No bookings</p>
      ) : (
        <ul className="chips">
          {shown.map((p, i) => <PersonChip key={`${p.label}-${i}`} p={p} />)}
          {hour.people.length > shown.length ? <li className="chip more">+{hour.people.length - shown.length}</li> : null}
        </ul>
      )}
    </li>
  );
}

function PersonChip({ p }: { p: KioskPerson }) {
  const mac = p.mac_no ?? p.preferred_mac_no;
  return (
    <li className={`chip${p.mac_clash ? ' clash' : ''}${p.checked_in ? ' in' : ''}`} title={p.mac_clash ? 'Possible Mac conflict' : undefined}>
      {p.mac_clash ? <span role="img" aria-label="Possible Mac conflict">⚠ </span> : null}
      {p.label}
      {mac ? <span className="chip-mac"> · Mac {mac}</span> : null}
    </li>
  );
}

const TABS = [
  { key: 'tutorials', label: 'Tutorials' },
  { key: 'materials', label: 'Class materials' },
  { key: 'resources', label: 'Resources' },
] as const;

function ContentPanel({ content }: { content: KioskFeed['content'] }) {
  const to = useKioskTo();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('tutorials');
  const items: KioskContent[] = content[tab];
  return (
    <aside className="kiosk-content" aria-label="Content">
      <div className="kiosk-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className="count">{content[t.key].length}</span>
          </button>
        ))}
      </div>
      <ul className="tile-col" role="tabpanel">
        {items.length === 0 ? <li className="muted kiosk-big">Nothing here yet.</li> : null}
        {items.map((c) => (
          <li key={c.id}>
            <Link className="kiosk-tile" to={to(`/kiosk/c/${c.id}`)}>
              <strong>{c.title}</strong>
              {c.summary ? <span className="muted">{c.summary}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
