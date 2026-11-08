import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { MacsTab } from './lab/MacsTab';
import { HoursTab } from './lab/HoursTab';
import { ClosuresTab } from './lab/ClosuresTab';
import { BookingsTab } from './lab/BookingsTab';
import { CreditsTab } from './lab/CreditsTab';

/** Admin › Lab: Macs, opening hours, closures, bookings and credits. */
export function LabAdminPage() {
  return (
    <div className="stack">
      <h2>Lab</h2>
      <nav aria-label="Lab" className="subnav">
        <NavLink to="/admin/lab/macs">Macs</NavLink>
        <NavLink to="/admin/lab/hours">Hours</NavLink>
        <NavLink to="/admin/lab/closures">Closures</NavLink>
        <NavLink to="/admin/lab/bookings">Bookings</NavLink>
        <NavLink to="/admin/lab/credits">Credits</NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="macs" replace />} />
        <Route path="macs" element={<MacsTab />} />
        <Route path="hours" element={<HoursTab />} />
        <Route path="closures" element={<ClosuresTab />} />
        <Route path="bookings" element={<BookingsTab />} />
        <Route path="credits" element={<CreditsTab />} />
        <Route path="*" element={<p>Page not found.</p>} />
      </Routes>
    </div>
  );
}
