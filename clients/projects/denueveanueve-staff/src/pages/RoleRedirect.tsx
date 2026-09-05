import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '@/components/staff/LoadingState';

/**
 * Entry redirect after auth resolves.
 *
 * The agenda and personnel views are now active (read-only), but the dashboard
 * remains the single, role-neutral landing for every authenticated staff user:
 * it works for all roles and avoids branching the entry flow. Owners/managers
 * reach the admin views from Ajustes (see Settings) and AdminBottomNav.
 */
export default function RoleRedirect() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;

  return <Navigate to="/dashboard" replace />;
}
