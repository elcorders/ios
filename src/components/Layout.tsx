import { useRef, type MouseEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { pushEnabledFor } from '../lib/features';
import { useUnreadCount } from '../lib/unread';
import { BellIcon } from './BellIcon';
import { ThemeToggle } from './ThemeToggle';
import { AccountMenu } from './AccountMenu';
import { Icon, type IconName } from './icons';

/** S21: this many presses of the header logo within the window open the kiosk. */
export const KIOSK_TAPS = 6;
export const KIOSK_TAP_WINDOW_MS = 3000;

const WIDE = ['/', '/resources', '/tutorials', '/materials', '/lab', '/admin'];

/** Page width by route: dashboards and lists use the screen; reading lists and forms stay narrow. */
export function pageWidth(pathname: string): 'wide' | 'reading' | 'narrow' {
  if (WIDE.some((p) => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)))) return 'wide';
  if (pathname === '/notifications') return 'reading';
  return 'narrow';
}

/**
 * App shell. Wide screens: links in the header. Phones (< 640px): the same links become a
 * bottom tab bar so every section is one tap away; the header keeps the logo, bell and theme.
 */
export function Layout() {
  const { me } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const taps = useRef<number[]>([]);
  // The first presses go Home as usual; only the one that completes the gesture is turned into /kiosk.
  const onLogo = (e: MouseEvent) => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t <= KIOSK_TAP_WINDOW_MS), now];
    if (taps.current.length >= KIOSK_TAPS) {
      taps.current = [];
      e.preventDefault();
      navigate('/kiosk');
    }
  };
  const bell = !!me && pushEnabledFor(me.is_admin);
  const unread = useUnreadCount(bell, pathname + search);
  const full = pathname.startsWith('/c/'); // content viewer: edge to edge
  const width = full ? 'full' : pageWidth(pathname);
  const tab = (to: string, label: string, ic: IconName, end = false) => (
    <NavLink to={to} end={end}>
      <Icon name={ic} />
      <span className="nav-label">{label}</span>
    </NavLink>
  );
  return (
    <div className={['app', full ? 'app-full' : '', me ? 'has-tabbar' : ''].filter(Boolean).join(' ')}>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-name" onClick={onLogo}>
            <span className="logo" aria-hidden="true"></span>
            <span className="app-name-text">NIBM iOS</span>
          </Link>
          {me ? (
            <nav aria-label="Main" className="main-nav">
              {tab('/', 'Home', 'home', true)}
              {tab('/resources', 'Resources', 'resources')}
              {tab('/tutorials', 'Tutorials', 'tutorials')}
              {tab('/materials', 'Materials', 'materials')}
              {me.is_admin ? tab('/admin', 'Admin', 'admin') : null}
            </nav>
          ) : null}
          <div className="header-actions">
            {bell ? (
              <NavLink to="/notifications" className="bell-link" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
                <BellIcon size={18} />
                {unread > 0 ? <span className="bell-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span> : null}
              </NavLink>
            ) : null}
            <ThemeToggle />
            {me ? <AccountMenu /> : null}
          </div>
        </div>
      </header>
      <main className={`app-main ${width}`}>
        <Outlet />
      </main>
    </div>
  );
}
