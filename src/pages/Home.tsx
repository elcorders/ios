import { Link, useNavigate } from 'react-router-dom';
import { WhatsAppCard } from '../components/WhatsAppCard';
import { useAuth } from '../auth/AuthProvider';
import { LAB_ENABLED } from '../lib/features';

export function Home() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const name = `${me.profile.first_name} ${me.profile.last_name}`.trim();
  return (
    <section className="stack-lg">
      <div className="card hero">
        <p className="eyebrow">Welcome back{me.profile.first_name ? `, ${me.profile.first_name}` : ''}</p>
        <h1>Home</h1>
        <p className="muted">
          Signed in as <strong>{name}</strong> ({me.profile.email})
        </p>
      </div>
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
        {LAB_ENABLED && me.enrolments.some((e) => e.role === 'student') ? (
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
