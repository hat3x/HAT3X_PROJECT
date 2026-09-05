// Listado de PERSONAL del salón (solo lectura). Reconstruido contra el esquema de Salón OS:
// lee `professionals` (nombre, estado activo y servicios que presta) del salón resuelto en
// runtime, vía `useProfessionals()`.
//
// ⛔ SOLO LECTURA — NO duplica la gestión de personal de Salón OS. Esta pantalla no da de alta,
// edita ni desactiva profesionales: el ABM del personal vive en el panel de Salón OS (se avisa
// al usuario en un aviso visible). Las tarjetas son deliberadamente NO interactivas para no
// insinuar acciones que esta vista no ofrece.
//
// Gating por rol: la ruta `/admin/employees` cuelga de `<AdminShell>`, que la protege con
// `<RequireRole allow={ADMIN_ROLES}>` (owner/manager). La autorización AUTORITATIVA la impone la
// RLS de Supabase; la guardia de rol solo evita pintar la pantalla sin permiso.

import { Users } from 'lucide-react';
import { useProfessionals } from '@/hooks/use-professionals';
import { initials, readableTextColor, type ProfessionalListItem } from '@/lib/professionals';
import { LoadingState } from '@/components/staff/LoadingState';
import { ErrorState } from '@/components/staff/ErrorState';
import { EmptyState } from '@/components/staff/EmptyState';
import { friendlyErrorMessage } from '@/lib/friendly-error';
import { Badge } from '@/components/ui/badge';

/** Avatar de iniciales. Usa el `color` del profesional con texto de contraste legible; si no
 *  hay color, cae a los tokens de marca. Decorativo (aria-hidden): el nombre ya va en texto. */
function ProfessionalAvatar({ professional }: { professional: ProfessionalListItem }) {
  const { color, fullName } = professional;
  return (
    <span
      aria-hidden="true"
      className={
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold' +
        (color ? '' : ' bg-primary/10 text-primary')
      }
      style={color ? { backgroundColor: color, color: readableTextColor(color) } : undefined}
    >
      {initials(fullName)}
    </span>
  );
}

/** Etiqueta de estado. El estado NO se transmite solo por color: siempre lleva texto explícito
 *  («Activo»/«Inactivo») además del punto de color, para cumplir WCAG 1.4.1. */
function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant={active ? 'secondary' : 'outline'}
      className={'shrink-0 gap-1.5' + (active ? '' : ' text-muted-foreground')}
    >
      <span
        aria-hidden="true"
        className={
          'h-1.5 w-1.5 rounded-full ' + (active ? 'bg-emerald-500' : 'bg-muted-foreground/50')
        }
      />
      {active ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}

/** Tarjeta de un profesional. Elemento NO interactivo (solo lectura). */
function ProfessionalCard({ professional }: { professional: ProfessionalListItem }) {
  const { fullName, active, services } = professional;
  return (
    <article className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <ProfessionalAvatar professional={professional} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate font-medium text-foreground">{fullName}</h2>
          <StatusBadge active={active} />
        </div>

        {services.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Servicios que presta ${fullName}`}>
            {services.map((service) => (
              <li key={service.id}>
                <Badge variant="secondary" className="font-normal">
                  {service.name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Sin servicios asignados</p>
        )}
      </div>
    </article>
  );
}

export default function AdminEmployees() {
  const { data, isLoading, isError, error, refetch } = useProfessionals();
  const professionals = data ?? [];
  const activeCount = professionals.filter((p) => p.active).length;

  // Resumen del estado actual para lectores de pantalla. Región viva SIEMPRE presente (no se
  // monta/desmonta): así el cambio carga → datos/vacío/error se anuncia de forma fiable y la
  // pantalla nunca queda «en blanco» en silencio para quien no ve el contenido visual.
  const statusMessage = isLoading
    ? 'Cargando el personal del salón.'
    : isError
      ? 'No se pudo cargar el personal.'
      : professionals.length === 0
        ? 'No hay personal en este salón.'
        : `${professionals.length} ${
            professionals.length === 1 ? 'profesional' : 'profesionales'
          }, ${activeCount} ${activeCount === 1 ? 'activo' : 'activos'}.`;

  return (
    <div className="px-4 pt-6">
      <header className="mb-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Users className="h-6 w-6 text-primary" aria-hidden="true" />
          Empleados
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Personal del salón. Vista de solo lectura.</p>
      </header>

      {/* Honra «no duplicar la gestión»: deja claro dónde se administra el personal. */}
      <p className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        El alta y la edición del personal se gestionan en el panel de Salón OS.
      </p>

      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {isLoading ? (
        <LoadingState message="Cargando empleados..." />
      ) : isError ? (
        <ErrorState
          title="No se pudo cargar el personal"
          message={friendlyErrorMessage(error, {
            fallback: 'No se pudo cargar el personal. Revisa tu conexión e inténtalo de nuevo.',
          })}
          onRetry={() => refetch()}
        />
      ) : professionals.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10 text-muted-foreground/40" />}
          title="Sin personal"
          message="Todavía no hay profesionales dados de alta en este salón."
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {professionals.length} {professionals.length === 1 ? 'profesional' : 'profesionales'}
            {' · '}
            {activeCount} {activeCount === 1 ? 'activo' : 'activos'}
          </p>
          <ul className="space-y-2">
            {professionals.map((professional) => (
              <li key={professional.id}>
                <ProfessionalCard professional={professional} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
