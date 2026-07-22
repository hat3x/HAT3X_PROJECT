import { useAuth } from '@/lib/auth';
import type { MemberRole } from '@/lib/auth';

interface RoleGateProps {
  allowed: readonly MemberRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Gating de rol a NIVEL DE ELEMENTO: muestra/oculta un fragmento de UI (un botón,
 * una sección) según el rol de `salon_members`. No redirige ni bloquea rutas.
 *
 * Para proteger una PANTALLA/ruta completa (con carga, redirección a login y
 * pantalla de acceso denegado) usa `<RequireRole>` en su lugar. Ambos consumen el
 * mismo rol de `useAuth()`, así que no duplican la lógica de autorización.
 */
export function RoleGate({ allowed, children, fallback = null }: RoleGateProps) {
  const { roles } = useAuth();
  const hasAccess = roles.some((r) => allowed.includes(r));
  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
