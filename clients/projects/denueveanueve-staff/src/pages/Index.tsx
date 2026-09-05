import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '@/components/staff/LoadingState';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/login" replace />;
}
