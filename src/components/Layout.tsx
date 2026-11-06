import { Link, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="app-name">NIBM iOS</Link>
        <nav aria-label="Main">
          <Link to="/lms">LMS</Link>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
