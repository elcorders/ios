import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ThemeToggle } from './ThemeToggle';

export function Layout() {
  const { me } = useAuth();
  const { pathname } = useLocation();
  const wide = pathname.startsWith('/admin');
  return (
    <div className="app">
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
            {me?.is_admin ? <NavLink to="/admin">Admin</NavLink> : null}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className={wide ? 'app-main wide' : 'app-main'}>
        <Outlet />
      </main>
    </div>
  );
}
