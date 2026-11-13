import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export function Home() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const name = `${me.profile.first_name} ${me.profile.last_name}`.trim();
  const students = me.enrolments.filter((e) => e.role === 'student' && e.status === 'active' && e.cohort_status === 'active');
  return (
    <section className="stack-lg">
      <AppTile pushOn={pushEnabledFor(me.is_admin)} />
      <div className="card hero">
        <p className="eyebrow">Welcome back{me.profile.first_name ? `, ${me.profile.first_name}` : ''}</p>
        <h1>Home</h1>
        <p className="muted">
          Signed in as <strong>{name}</strong> ({me.profile.email})
        </p>
      </div>
      {students.filter((e) => e.group_name).map((e) => <NextSession key={`s-${e.enrolment_id}`} enrolment={e} />)}
      {students.filter((e) => e.lab_open).map((e) => <LabCard key={`l-${e.enrolment_id}`} enrolment={e} />)}
      {me.enrolments
        .filter((e) => e.role === 'student' && e.status === 'active' && e.group_name)
        .map((e) => (
          <div key={e.enrolment_id} className="card group-card">
            <span className="group-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <p>
              Your group: <strong>{e.group_name}</strong>
            </p>
            <Link to="/transfer">Request a group change</Link>
          </div>
        ))}
      <div className="quick-links">
        <Link to="/resources" className="card content-card">
          <span className="content-card-title">Resources</span>
          <span className="muted">Guides and references</span>
        </Link>
        <Link to="/tutorials" className="card content-card">
          <span className="content-card-title">Tutorials</span>
          <span className="muted">Step-by-step tutorials</span>
        </Link>
        <Link to="/materials" className="card content-card">
          <span className="content-card-title">Class materials</span>
          <span className="muted">Materials for your classes</span>
        </Link>
        {me.is_admin || me.enrolments.some((e) => e.role === 'student' && e.status === 'active' && e.lab_open) ? (
          <Link to="/lab" className="card content-card">
            <span className="content-card-title">Lab booking</span>
            <span className="muted">Book a lab Mac</span>
          </Link>
        ) : null}
        <Link to="/install" className="card content-card">
          <span className="content-card-title">Install the app</span>
          <span className="muted">Add it to your home screen</span>
        </Link>
      </div>
      <WhatsAppCard enrolments={me.enrolments} />
      <button
        type="button"
        className="inline"
        onClick={async () => {
          await signOut();
          navigate('/login', { replace: true });
        }}
      >
        Sign out
      </button>
    </section>
  );
}
