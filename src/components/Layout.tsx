import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { pushEnabledFor } from '../lib/features';
import { useUnreadCount } from '../lib/unread';
import { BellIcon } from './BellIcon';
import { ThemeToggle } from './ThemeToggle';

const icon = (d: ReactNode) => (
  <svg className="nav-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {d}
  </svg>
);
const ICONS = {
  home: icon(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>),
  resources: icon(<><path d="M4 4h6l2 2h8v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /></>),
  tutorials: icon(<><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z" /><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></>),
  materials: icon(<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>),
  admin: icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
};

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
  const bell = !!me && pushEnabledFor(me.is_admin);
  const unread = useUnreadCount(bell, pathname + search);
  const full = pathname.startsWith('/c/'); // content viewer: edge to edge
  const width = full ? 'full' : pageWidth(pathname);
  const tab = (to: string, label: string, ic: ReactNode, end = false) => (
    <NavLink to={to} end={end}>
      {ic}
      <span className="nav-label">{label}</span>
    </NavLink>
  );
  return (
    <div className={['app', full ? 'app-full' : '', me ? 'has-tabbar' : ''].filter(Boolean).join(' ')}>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-name">
            <span className="logo" aria-hidden="true"></span>
            <span className="app-name-text">NIBM iOS</span>
          </Link>
          {me ? (
            <nav aria-label="Main" className="main-nav">
              {tab('/', 'Home', ICONS.home, true)}
              {tab('/resources', 'Resources', ICONS.resources)}
              {tab('/tutorials', 'Tutorials', ICONS.tutorials)}
              {tab('/materials', 'Materials', ICONS.materials)}
              {me.is_admin ? tab('/admin', 'Admin', ICONS.admin) : null}
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
          </div>
        </div>
      </header>
      <main className={`app-main ${width}`}>
        <Outlet />
      </main>
    </div>
  );
}
