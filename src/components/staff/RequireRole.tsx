import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type MemberRole } from '@/lib/auth';
import { LoadingState } from '@/components/staff/LoadingState';
import { AccessDenied } from '@/components/staff/AccessDenied';

interface RequireRoleProps {
  /** Roles del salón autorizados a ver el contenido protegido. */
  allow: readonly MemberRole[];
  /**
   * Contenido a proteger. Si se omite se renderiza `<Outlet/>` para usarlo como
   * layout de rutas anidadas de react-router.
   */
  children?: ReactNode;
  /** Mensaje mostrado cuando el usuario está autenticado pero sin rol suficiente. */
  deniedMessage?: string;
}

/**
 * Guardia de rol REUTILIZABLE para las vistas de salón.
 *
 * Lee el rol del miembro a través de `useAuth()`, que a su vez lo obtiene UNA sola
 * vez de `salon_members`. Por tanto NO vuelve a consultar la tabla ni reimplementa
 * la jerarquía de permisos: consume los conjuntos declarativos `allow` (p. ej.
 * `ADMIN_ROLES`), de modo que no se duplica lógica de autorización por pantalla.
 *
 * ⚠️ Es una capa de UX / defensa en profundidad: evita PINTAR pantallas que la RLS
 * ya rechazaría en el servidor. La autorización AUTORITATIVA vive en las políticas
 * RLS de Supabase; esta guardia nunca es la barrera real de seguridad.
 *
 * Flujo:
 *  - cargando          → spinner de verificación
 *  - sin sesión        → redirige a /login
 *  - rol insuficiente  → pantalla de acceso denegado (bloqueo explícito)
 *  - autorizado        → renderiza el contenido protegido / `<Outlet/>`
 */
export function RequireRole({ allow, children, deniedMessage }: RequireRoleProps) {
  const { user, loading, roles } = useAuth();

  if (loading) return <LoadingState message="Verificando acceso..." />;
  if (!user) return <Navigate to="/login" replace />;

  const authorized = roles.some((role) => allow.includes(role));
  if (!authorized) return <AccessDenied message={deniedMessage} />;

  return <>{children ?? <Outlet />}</>;
}
