import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Me, MyEnrolment } from '../api/types';
import { useAuth } from './AuthProvider';

/** First active student enrolment in an active cohort that still owes the survey (S2). */
export function surveyCohort(me: Me): MyEnrolment | undefined {
  return me.enrolments.find(
    (e) => e.role === 'student' && e.status === 'active' && e.cohort_status === 'active' && !e.survey_done,
  );
}

/**
 * Wraps pages that need a signed-in user. UX only: the backend enforces access.
 * Users who have not finished security setup are sent to `/setup`, which itself
 * only requires sign-in. Students who still owe the survey go to `/survey` next.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <p role="status">Loading…</p>;
  if (!me) return <Navigate to="/login" replace />;
  if (!me.security.setup_complete && pathname !== '/setup') return <Navigate to="/setup" replace />;
  if (me.security.setup_complete && pathname !== '/survey' && surveyCohort(me)) return <Navigate to="/survey" replace />;
  return <>{children}</>;
}
