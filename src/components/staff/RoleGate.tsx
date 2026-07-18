import { useAuth } from '@/lib/auth';
import type { MemberRole } from '@/lib/auth';

interface RoleGateProps {
  allowed: MemberRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ allowed, children, fallback = null }: RoleGateProps) {
  const { roles } = useAuth();
  const hasAccess = roles.some((r) => allowed.includes(r));
  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
