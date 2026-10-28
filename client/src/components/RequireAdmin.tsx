import type { ReactNode } from 'react';
import { useSessionInfo } from '../lib/session';
import { NotFound } from '../pages/NotFound';

/** Hides admin pages from everyone but the platform admin. The server enforces the same rule on every /api/admin request. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, pending } = useSessionInfo();
  if (pending) return <p className="text-muted">Loading…</p>;
  if (!session?.isAdmin) return <NotFound />;
  return <>{children}</>;
}
