import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from '../../api';
import type { AdminCohort } from '../../api/types';
import { CohortSettingsPage } from './CohortSettingsPage';
import { ImportPage } from './ImportPage';
import { useAuth } from '../../auth/AuthProvider';
import { messageFor } from '../../lib/errors';
import { AdminContext } from './AdminContext';
import { MembersPage } from './MembersPage';
import { SurveyPage } from './SurveyPage';
import { GroupsPage } from './GroupsPage';
import { LabAdminPage } from './LabAdminPage';
import { LAB_ENABLED } from '../../lib/features';
import { PendingPage } from './PendingPage';
import { ContentPage } from './ContentPage';
import { TransfersPage } from './TransfersPage';
import { onOpenCount } from './transfers/openCount';

const STORAGE_KEY = 'ios.admin.cohort';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable: selection just is not remembered
  }
}

/** Admin area. The "Not allowed" view is UX only; the backend enforces access. */
export function AdminLayout() {
  const { me } = useAuth();
  if (!me?.is_admin) {
    return (
      <section className="card">
        <h1>Not allowed</h1>
        <p>This area is for admins only.</p>
      </section>
    );
  }
  return <AdminArea />;
}

function AdminArea() {
  const [cohorts, setCohorts] = useState<AdminCohort[] | null>(null);
  const [selected, setSelected] = useState<string | null>(readStored);
  const [error, setError] = useState<string | null>(null);
  const [openTransfers, setOpenTransfers] = useState<{ cohortId: string; count: number } | null>(null);
  const cohortId = cohorts?.length ? (cohorts.find((c) => c.id === selected) ?? cohorts.find((c) => c.status === 'active') ?? cohorts[0]!).id : null;

  useEffect(() => onOpenCount((id, count) => setOpenTransfers({ cohortId: id, count })), []);
  useEffect(() => {
    if (!cohortId) return;
    let live = true;
    void api.adminListTransfers(cohortId).then((res) => {
      if (live && res.ok) setOpenTransfers({ cohortId, count: res.data.requests.filter((r) => r.status === 'open').length });
    });
    return () => {
      live = false;
    };
  }, [cohortId]);

  const reloadCohorts = useCallback(async () => {
    const res = await api.adminListCohorts();
    if (res.ok) {
      setCohorts(res.data);
      setError(null);
    } else {
      setError(messageFor(res.error));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reloadCohorts();
  }, [reloadCohorts]);

  const cohort = useMemo(() => {
    if (!cohorts?.length) return null;
    return cohorts.find((c) => c.id === selected) ?? cohorts.find((c) => c.status === 'active') ?? cohorts[0]!;
  }, [cohorts, selected]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!cohorts) return <p role="status">Loading…</p>;
  if (!cohort) return <p>No cohorts yet.</p>;

  const readOnly = cohort.status === 'archived';
  const choose = (id: string) => {
    setSelected(id);
    writeStored(id);
  };

  return (
    <AdminContext.Provider value={{ cohort, cohorts, readOnly, reloadCohorts }}>
      <section className="stack">
        <div className="admin-head">
          <h1>Admin</h1>
          <div className="field">
            <label htmlFor="cohort-switcher">Cohort</label>
            <select id="cohort-switcher" value={cohort.id} onChange={(e) => choose(e.target.value)}>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} ({c.batch}){c.status === 'archived' ? ' - archived' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        {readOnly ? (
          <p role="status" className="banner">This cohort is archived and read-only.</p>
        ) : null}
        <nav aria-label="Admin" className="subnav">
          <NavLink to="/admin/members">Members</NavLink>
          <NavLink to="/admin/instructors">Instructors</NavLink>
          <NavLink to="/admin/pending">Pending ({cohort.counts.pending})</NavLink>
          <NavLink to="/admin/cohort">Cohort</NavLink>
          <NavLink to="/admin/survey">Survey</NavLink>
          <NavLink to="/admin/groups">Groups</NavLink>
          <NavLink to="/admin/transfers">
            Transfers{openTransfers?.cohortId === cohort.id ? ` (${openTransfers.count})` : ''}
          </NavLink>
          {LAB_ENABLED ? <NavLink to="/admin/lab">Lab</NavLink> : null}
          <NavLink to="/admin/content">Content</NavLink>
          <NavLink to="/admin/import">Import</NavLink>
        </nav>
        <Routes>
          <Route index element={<Navigate to="members" replace />} />
          <Route path="members" element={<MembersPage role="student" />} />
          <Route path="instructors" element={<MembersPage role="instructor" />} />
          <Route path="pending" element={<PendingPage />} />
          <Route path="cohort" element={<CohortSettingsPage />} />
          <Route path="survey" element={<SurveyPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="transfers" element={<TransfersPage />} />
          {LAB_ENABLED ? <Route path="lab/*" element={<LabAdminPage />} /> : null}
          <Route path="content" element={<ContentPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </section>
    </AdminContext.Provider>
  );
}
