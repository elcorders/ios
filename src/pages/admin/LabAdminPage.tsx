import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from '../../api';
import { messageFor } from '../../lib/errors';
import { useAdmin } from './AdminContext';
import './transfers/transfers.css';
import { CalendarTab } from './lab/CalendarTab';
import { MacsTab } from './lab/MacsTab';
import { HoursTab } from './lab/HoursTab';
import { ClosuresTab } from './lab/ClosuresTab';
import { BookingsTab } from './lab/BookingsTab';
import { CreditsTab } from './lab/CreditsTab';

/** Admin › Lab: Calendar, Macs, opening hours, closures, bookings and credits. */
export function LabAdminPage() {
  const { cohort, readOnly, reloadCohorts } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = cohort.settings.lab_open === true;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    const res = await api.adminUpdateCohortSettings(cohort.id, { lab_open: !open });
    if (res.ok) await reloadCohorts();
    else setError(messageFor(res.error));
    setBusy(false);
  };

  return (
    <div className="stack">
      <div className="tr-head">
        <h2>Lab</h2>
        <button type="button" role="switch" aria-checked={open} className="tr-switch"
          disabled={readOnly || busy} onClick={() => void toggle()}>
          <span>Lab booking for {cohort.code}: {open ? 'Open' : 'Closed'}</span>
          <span className="tr-knob" aria-hidden="true" />
        </button>
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <nav aria-label="Lab" className="subnav">
        <NavLink to="/admin/lab/calendar">Calendar</NavLink>
        <NavLink to="/admin/lab/macs">Macs</NavLink>
        <NavLink to="/admin/lab/hours">Hours</NavLink>
        <NavLink to="/admin/lab/closures">Closures</NavLink>
        <NavLink to="/admin/lab/bookings">Bookings</NavLink>
        <NavLink to="/admin/lab/credits">Credits</NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="calendar" replace />} />
        <Route path="calendar" element={<CalendarTab />} />
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
