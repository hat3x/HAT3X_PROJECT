import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

interface AccessDeniedProps {
  /** Título del bloqueo. */
  title?: string;
  /** Explicación de por qué se deniega el acceso. */
  message?: string;
  /** Ruta a la que vuelve el usuario. Por defecto, el inicio del staff. */
  homeTo?: string;
}

/**
 * Pantalla de "acceso denegado" reutilizable para el gating de rol.
 *
 * Se usa cuando un usuario AUTENTICADO no tiene el rol requerido para una vista
 * (p. ej. staff intentando entrar a una pantalla de administración). Es una capa
 * de UX; el bloqueo AUTORITATIVO lo impone la RLS de Supabase en el servidor.
 *
 * Accesible: se anuncia como `alert`/`aria-live=assertive` (mismo contrato que
 * SalonUnavailable) para que los lectores de pantalla comuniquen el bloqueo.
 */
export function AccessDenied({
  title = 'Acceso denegado',
  message = 'Tu cuenta no tiene permisos para ver esta sección.',
  homeTo = '/dashboard',
}: AccessDeniedProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-screen items-center justify-center bg-background p-6"
    >
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link
          to={homeTo}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
