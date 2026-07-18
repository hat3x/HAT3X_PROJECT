import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '@/components/staff/LoadingState';

/**
 * Entry redirect after auth resolves.
 *
 * The role-specific landing pages (employee calendar / admin employees) are
 * out of scope in the Salón OS build and are disabled, so every authenticated
 * staff user lands on the in-scope dashboard.
 */
export default function RoleRedirect() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;

  return <Navigate to="/dashboard" replace />;
}
