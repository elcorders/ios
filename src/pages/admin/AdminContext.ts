import { createContext, useContext } from 'react';
import type { AdminCohort } from '../../api/types';

export interface AdminCtx {
  cohort: AdminCohort;
  cohorts: AdminCohort[];
  /** Archived cohorts are read-only (UX only; the backend enforces it). */
  readOnly: boolean;
  /** Re-fetch cohorts (counts change after approvals). */
  reloadCohorts: () => Promise<void>;
}

export const AdminContext = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminLayout');
  return ctx;
}
