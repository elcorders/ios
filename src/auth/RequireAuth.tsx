import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/**
 * Wraps pages that need a signed-in user. UX only: the backend enforces access.
 * Hook point for S1.F2: add the security-setup gate (`me.security.setup_complete`) here.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <p role="status">Loading…</p>;
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
