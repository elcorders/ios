import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/**
 * Wraps pages that need a signed-in user. UX only: the backend enforces access.
 * Users who have not finished security setup are sent to `/setup`, which itself
 * only requires sign-in.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <p role="status">Loading…</p>;
  if (!me) return <Navigate to="/login" replace />;
  if (!me.security.setup_complete && pathname !== '/setup') return <Navigate to="/setup" replace />;
  return <>{children}</>;
}
