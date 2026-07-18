import { AlertTriangle, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Motivo por el que no hay salón que pintar:
//   'not-found' → la RPC respondió VACÍO: el slug no existe o el salón está inactivo.
//   'network'   → la RPC lanzó un error de transporte/SQL (reintentable).
export type SalonUnavailableVariant = 'not-found' | 'network';

interface SalonUnavailableProps {
  variant: SalonUnavailableVariant;
  /** Slug que se intentó resolver; se muestra para dar contexto al usuario/soporte. */
  slug: string;
  /** Reintentar la resolución (re-lanza la RPC). Si se omite, no se muestra el botón. */
  onRetry?: () => void;
  /** Reintento en curso: deshabilita el botón y anima el icono. */
  busy?: boolean;
}

const COPY: Record<
  SalonUnavailableVariant,
  { Icon: LucideIcon; title: string; message: (slug: string) => string }
> = {
  'not-found': {
    Icon: AlertTriangle,
    title: 'Salón no disponible',
    message: (slug) =>
      `No hemos encontrado ningún salón activo para «${slug}». Revisa la dirección con la ` +
      'que has accedido o contacta con tu administrador.',
  },
  network: {
    Icon: WifiOff,
    title: 'No se pudo cargar el salón',
    message: () =>
      'Ha habido un problema de conexión al cargar los datos del salón. Comprueba tu ' +
      'conexión e inténtalo de nuevo.',
  },
};

// Pantalla de error CONTROLADA a pantalla completa: sustituye por completo al árbol de
// la app cuando el salón no se puede resolver (nunca llega a montarse el resto). Es lo
// primero y único que ve el usuario, así que va a viewport completo y es accesible.
export function SalonUnavailable({ variant, slug, onRetry, busy }: SalonUnavailableProps) {
  const { Icon, title, message } = COPY[variant];
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <Icon className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message(slug)}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} disabled={busy}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {busy ? 'Reintentando…' : 'Reintentar'}
        </Button>
      )}
    </div>
  );
}
