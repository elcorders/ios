import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from './icons';

function initials(first: string, last: string, email: string): string {
  const a = first.trim()[0] ?? '';
  const b = last.trim()[0] ?? '';
  return (a + b || email[0] || '?').toUpperCase();
}

/** Header profile button with a small account popover (identity, groups, links, Sign out). */
export function AccountMenu() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!me) return null;
  const { first_name, last_name, email } = me.profile;
  const name = `${first_name} ${last_name}`.trim();
  const groups = me.enrolments.filter((e) => e.role === 'student' && e.status === 'active' && e.group_name);

  return (
    <div
      className="account"
      ref={wrap}
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null) && e.relatedTarget) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="avatar-btn"
        aria-label="Account"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">{initials(first_name, last_name, email)}</span>
      </button>
      {open ? (
        <div className="account-panel" id={id} ref={panel} role="group" aria-label="Account menu">
          <div className="account-id">
            {name ? <p className="account-name">{name}</p> : null}
            <p className="account-email muted">{email}</p>
            {groups.map((e) => (
              <p key={e.enrolment_id} className="account-group muted">{e.group_name} · {e.cohort_code}</p>
            ))}
          </div>
          <ul className="account-links">
            {groups.length > 0 ? (
              <li><Link to="/transfer" onClick={() => setOpen(false)}><Icon name="swap" size={20} />Request a group change</Link></li>
            ) : null}
            <li><Link to="/install" onClick={() => setOpen(false)}><Icon name="install" size={20} />Install the app</Link></li>
            <li>
              <button
                type="button"
                className="account-signout"
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                  navigate('/login', { replace: true });
                }}
              >
                <Icon name="signout" size={20} />Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
