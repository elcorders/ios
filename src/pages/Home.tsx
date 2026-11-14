import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/icons';
import { WhatsAppCard } from '../components/WhatsAppCard';
import { fireConfetti } from '../components/Confetti';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../api';
import type { MyEnrolment, MyLab, MySession } from '../api/types';
import { detectPlatform, isStandalone, useInstallPrompt } from '../lib/pwa';
import { usePushState } from '../lib/push';
import { pushEnabledFor } from '../lib/features';
import { formatColombo } from '../lib/time';
import './home.css';

const CELEBRATED_KEY = 'ios-installed-celebrated';

function celebrateOnce(): void {
  try {
    if (localStorage.getItem(CELEBRATED_KEY)) return;
    localStorage.setItem(CELEBRATED_KEY, '1');
  } catch {
    return;
  }
  fireConfetti();
}

function AppTile({ pushOn }: { pushOn: boolean }) {
  const { canInstall, install } = useInstallPrompt();
  const push = usePushState();
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const standalone = isStandalone();

  useEffect(() => {
    if (standalone) celebrateOnce();
    const onInstalled = () => {
      try {
        localStorage.setItem(CELEBRATED_KEY, '1');
      } catch {
        // ignore
      }
      fireConfetti();
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, [standalone]);

  const installed = standalone || (platform === 'desktop' && !canInstall);

  if (!installed) {
    const ios = platform === 'ios-safari' || platform === 'ios-other';
    return (
      <section className="card app-tile" aria-label="App">
        <h2>Install the app</h2>
        {canInstall ? (
          <>
            <p className="muted">{pushOn ? 'Add it to your device for quick access and class notifications.' : 'Add it to your device for quick access.'}</p>
            <div className="app-tile-actions">
              <button type="button" className="primary" onClick={() => void install()}>Install</button>
              <Link to="/install">More help</Link>
            </div>
          </>
        ) : platform === 'ios-safari' ? (
          <>
            <p className="muted">{pushOn ? 'Install it to get class notifications:' : 'Install it on your iPhone or iPad:'}</p>
            <ol className="install-steps">
              <li>Tap the Share button in Safari</li>
              <li>Choose Add to Home Screen</li>
              <li>Open the app from your Home Screen</li>
            </ol>
            <p><Link to="/install">Show me how</Link></p>
          </>
        ) : ios ? (
          <>
            <p className="muted">Open this page in Safari to install the app on your iPhone or iPad.</p>
            <p><Link to="/install">Show me how</Link></p>
          </>
        ) : (
          <>
            <p className="muted">Add it to your home screen from your browser menu.</p>
            <p><Link to="/install">Show me how</Link></p>
          </>
        )}
      </section>
    );
  }

  if (!pushOn) return null;
  if (push.support === 'unsupported' || push.support === 'needs_install' || push.subscribed === null) return null;

  if (push.support === 'denied') {
    return (
      <section className="card app-tile" aria-label="Notifications">
        <h2>Notifications are blocked</h2>
        <p className="muted">To get class and lab updates, allow notifications for this app in your device or browser settings, then reopen it.</p>
      </section>
    );
  }

  if (push.support === 'granted' && push.subscribed) {
    return <p className="muted notif-on" role="status">Notifications on</p>;
  }

  return (
    <section className="card app-tile" aria-label="Notifications">
      <h2>Turn on notifications</h2>
      <p className="muted">We only send class and lab updates. No spam.</p>
      {push.error ? <p role="alert" className="error">{push.error}</p> : null}
      <div className="app-tile-actions">
        <button
          type="button"
          className="primary"
          disabled={push.busy}
          onClick={async () => {
            if (await push.enable()) fireConfetti();
          }}
        >
          Turn on notifications
        </button>
      </div>
    </section>
  );
}

const dayLabel = (iso: string) => formatColombo(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = (iso: string) => formatColombo(iso, { hour: '2-digit', minute: '2-digit', hour12: false });

function NextSession({ enrolment }: { enrolment: MyEnrolment }) {
  const [session, setSession] = useState<MySession | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void api.getMySessions(enrolment.cohort_id).then((r) => live && setSession(r.ok ? r.data.next : null));
    return () => {
      live = false;
    };
  }, [enrolment.cohort_id]);
  if (session === undefined) return null;
  return (
    <section className="card next-session" aria-label={`Next session, ${enrolment.cohort_code}`}>
      <h2>Next session</h2>
      {session === null ? (
        <p className="muted">No upcoming sessions</p>
      ) : (
        <>
          <p className="session-when">
            {dayLabel(session.starts_at)} · {session.start_time}–{session.end_time}
          </p>
          <p><strong>{session.title}</strong></p>
          {session.deliverables.length > 0 ? (
            <>
              <p className="muted">Deliverables</p>
              <ul className="session-list">
                {session.deliverables.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </>
          ) : null}
          {session.content.length > 0 ? (
            <ul className="session-links" aria-label="Linked items">
              {session.content.map((c) => (
                <li key={c.id}>
                  {c.available ? <Link to={`/c/${c.id}`}>{c.title}</Link> : <span className="muted">{c.title} · Opens at your session</span>}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

const REASONS: Record<string, string> = {
  has_mac: 'You have your own Mac, so lab booking is not needed.',
  no_survey: 'Complete the survey to book lab time.',
  suspended: 'Lab booking is paused for your account.',
  not_student: 'Lab booking is for students.',
  lab_closed: 'Lab booking is closed right now.',
};

function LabCard({ enrolment }: { enrolment: MyEnrolment }) {
  const [lab, setLab] = useState<MyLab | null | undefined>(undefined);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    void api.getMyLab(enrolment.cohort_id).then((r) => live && setLab(r.ok ? r.data : null));
    return () => {
      live = false;
    };
  }, [enrolment.cohort_id]);
  if (!lab) return null;
  const upcoming = lab.bookings
    .filter((b) => b.status === 'booked' && Date.parse(b.slot_end) > now)
    .sort((a, b) => a.slot_start.localeCompare(b.slot_start))
    .slice(0, 3);
  if (upcoming.length === 0 && !lab.eligible && lab.reason === null) return null;
  return (
    <section className="card lab-card" aria-label={`My lab bookings, ${enrolment.cohort_code}`}>
      <h2>My lab bookings</h2>
      {upcoming.length > 0 ? (
        <ul className="lab-list">
          {upcoming.map((b) => (
            <li key={b.id}>{dayLabel(b.slot_start)} · {timeLabel(b.slot_start)}–{timeLabel(b.slot_end)}</li>
          ))}
        </ul>
      ) : lab.eligible ? (
        <p className="muted">No upcoming bookings</p>
      ) : (
        <p className="muted">{REASONS[lab.reason ?? ''] ?? 'Lab booking is not available for you.'}</p>
      )}
      {lab.eligible ? <p className="muted">Credits left: {lab.credits.remaining}</p> : null}
      <Link to="/lab">Book or manage</Link>
    </section>
  );
}

type Tile = { to: string; icon: IconName; title: string; text: string; tone: string };

export function Home() {
  const { me } = useAuth();
  if (!me) return null;
  const students = me.enrolments.filter((e) => e.role === 'student' && e.status === 'active' && e.cohort_status === 'active');
  const labTile = me.is_admin || me.enrolments.some((e) => e.role === 'student' && e.status === 'active' && e.lab_open);
  const tiles: Tile[] = [
    { to: '/resources', icon: 'resources', title: 'Resources', text: 'Guides and references', tone: 'blue' },
    { to: '/tutorials', icon: 'tutorials', title: 'Tutorials', text: 'Step-by-step tutorials', tone: 'violet' },
    { to: '/materials', icon: 'materials', title: 'Class materials', text: 'Materials for your classes', tone: 'teal' },
  ];
  if (labTile) tiles.push({ to: '/lab', icon: 'lab', title: 'Lab booking', text: 'Book a lab Mac', tone: 'amber' });
  if (pushEnabledFor(me.is_admin)) tiles.push({ to: '/notifications', icon: 'bell', title: 'Notifications', text: 'Class and lab updates', tone: 'rose' });
  if (me.is_admin) tiles.push({ to: '/admin', icon: 'admin', title: 'Admin', text: 'Manage classes and students', tone: 'slate' });
  const groups = me.enrolments.filter((e) => e.role === 'student' && e.status === 'active' && e.group_name);
  const today = formatColombo(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section className="stack-lg home">
      <AppTile pushOn={pushEnabledFor(me.is_admin)} />
      <div className="home-greeting">
        <h1 className="sr-only">Home</h1>
        <p className="greeting-hi" aria-hidden="true">Hi{me.profile.first_name ? `, ${me.profile.first_name}` : ''}</p>
        <p className="greeting-date muted">{today}</p>
      </div>
      <nav className={`tile-grid tiles-${tiles.length}`} aria-label="Quick links">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className={`tile tone-${t.tone}`}>
            <span className="tile-icon" aria-hidden="true"><Icon name={t.icon} size={24} className="" /></span>
            <span className="tile-body">
              <span className="tile-title">{t.title}</span>
              <span className="tile-text muted">{t.text}</span>
            </span>
          </Link>
        ))}
      </nav>
      <div className="home-grid">
        <div className="home-main stack-lg">
          {students.filter((e) => e.group_name).map((e) => <NextSession key={`s-${e.enrolment_id}`} enrolment={e} />)}
          {students.filter((e) => e.lab_open).map((e) => <LabCard key={`l-${e.enrolment_id}`} enrolment={e} />)}
        </div>
        <div className="home-side stack-lg">
          {groups.map((e) => (
            <div key={e.enrolment_id} className="card group-card" role="group" aria-label="Your group">
              <span className="group-icon" aria-hidden="true"><Icon name="group" size={22} className="" /></span>
              <p>
                <span className="muted">Your group</span>
                <strong>{e.group_name}</strong>
              </p>
              <Link to="/transfer" className="group-change">Request change</Link>
            </div>
          ))}
          <WhatsAppCard enrolments={me.enrolments} />
        </div>
      </div>
    </section>
  );
}
