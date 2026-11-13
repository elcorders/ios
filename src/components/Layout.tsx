import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { pushEnabledFor } from '../lib/features';
import { useUnreadCount } from '../lib/unread';
import { BellIcon } from './BellIcon';
import { ThemeToggle } from './ThemeToggle';

export function Layout() {
  const { me } = useAuth();
  const { pathname, search } = useLocation();
  const bell = !!me && pushEnabledFor(me.is_admin);
  const unread = useUnreadCount(bell, pathname + search);
  const wide = pathname.startsWith('/admin');
  const full = pathname.startsWith('/c/'); // content viewer: edge to edge
  return (
    <div className={full ? 'app app-full' : 'app'}>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-name">
            <span className="logo" aria-hidden="true"></span>
            <span className="app-name-text">NIBM iOS</span>
          </Link>
          <nav aria-label="Main" className="main-nav">
            {me ? <NavLink to="/" end>Home</NavLink> : null}
            {me ? <NavLink to="/resources">Resources</NavLink> : null}
            {me ? <NavLink to="/tutorials">Tutorials</NavLink> : null}
            {me ? <NavLink to="/materials">Materials</NavLink> : null}
            {bell ? (
              <NavLink to="/notifications" className="bell-link" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
                <BellIcon size={18} />
                {unread > 0 ? <span className="bell-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span> : null}
              </NavLink>
            ) : null}
            {me?.is_admin ? <NavLink to="/admin">Admin</NavLink> : null}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className={full ? 'app-main full' : wide ? 'app-main wide' : 'app-main'}>
        <Outlet />
      </main>
    </div>
  );
}
