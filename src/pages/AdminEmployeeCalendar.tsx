import { useMemo, useState } from 'react';
import { addDays, isToday, startOfDay } from 'date-fns';
import { CalendarClock, CalendarOff, ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react';
import { RequireRole } from '@/components/staff/RequireRole';
import { ADMIN_ROLES } from '@/lib/auth';
import { LoadingState } from '@/components/staff/LoadingState';
import { ErrorState } from '@/components/staff/ErrorState';
import { EmptyState } from '@/components/staff/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDayAppointments } from '@/hooks/use-appointments';
import type { AppointmentListItem, AppointmentStatus } from '@/lib/appointments';
import {
  APPOINTMENT_STATUS_LABELS,
  countAppointments,
  groupAppointmentsByProfessional,
  professionalDisplayName,
  type ProfessionalGroup,
} from '@/lib/appointment-groups';

// Vista de administración: la agenda del DÍA de TODO el salón, agrupada por profesional
// (owner/manager). Es de solo lectura: LEE citas ya existentes (capa de datos sub-2) y las
// reparte por profesional (helper appointment-groups). No calcula disponibilidad en cliente.

const ADMIN_CALENDAR_DENIED =
  'Necesitas permisos de administración (propietario o encargado) para ver la agenda del salón.';

// Formateadores es-ES creados UNA vez (instanciar Intl por render es caro).
const DAY_FMT = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const TIME_FMT = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

// Variante de badge por estado. El color es SECUNDARIO: el significado lo lleva SIEMPRE la
// etiqueta de texto (APPOINTMENT_STATUS_LABELS), nunca el color en solitario (WCAG SC 1.4.1).
type BadgeVariant = NonNullable<BadgeProps['variant']>;
const STATUS_BADGE_VARIANT: Record<AppointmentStatus, BadgeVariant> = {
  pending: 'outline',
  confirmed: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
  no_show: 'destructive',
};

// Estados que "no ocurren": se atenúan para que no compitan visualmente con las citas vivas.
const INACTIVE_STATUSES: ReadonlySet<AppointmentStatus> = new Set(['cancelled', 'no_show']);

function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  return `${TIME_FMT.format(new Date(startsAt))} – ${TIME_FMT.format(new Date(endsAt))}`;
}

/**
 * Página de agenda del salón. Va autoprotegida por rol (sub-4): además del `<AdminShell>`
 * de la ruta, se envuelve en `<RequireRole allow={ADMIN_ROLES}>` como DEFENSA EN PROFUNDIDAD,
 * para que la pantalla sea correcta aunque se monte fuera de ese layout. La barrera de datos
 * AUTORITATIVA sigue siendo la RLS de Supabase; esta guardia solo evita pintar la agenda.
 */
export default function AdminEmployeeCalendar() {
  return (
    <RequireRole allow={ADMIN_ROLES} deniedMessage={ADMIN_CALENDAR_DENIED}>
      <AdminEmployeeCalendarView />
    </RequireRole>
  );
}

function AdminEmployeeCalendarView() {
  // Día seleccionado, normalizado a las 00:00 LOCALES: así el rango del hook (dayRange) y su
  // clave de caché de React Query son estables dentro del mismo día natural.
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));

  // Reutiliza la capa de datos (sub-2): una sola consulta acotada por salon_id + rango del
  // día, con cliente/servicio/profesional embebidos (sin N+1).
  const { data, isLoading, isError, isFetching, refetch } = useDayAppointments(day);

  const groups = useMemo(() => groupAppointmentsByProfessional(data ?? []), [data]);
  const total = countAppointments(groups);
  const professionalCount = groups.length;

  const goToPreviousDay = () => setDay((d) => startOfDay(addDays(d, -1)));
  const goToNextDay = () => setDay((d) => startOfDay(addDays(d, 1)));
  const goToToday = () => setDay(startOfDay(new Date()));
  const dayIsToday = isToday(day);

  const countsLabel = `${total} ${total === 1 ? 'cita' : 'citas'} · ${professionalCount} ${
    professionalCount === 1 ? 'profesional' : 'profesionales'
  }`;

  return (
    <div className="px-4 pt-6 pb-4">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <CalendarClock className="h-6 w-6 text-primary" aria-hidden="true" />
          Agenda del salón
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Citas de todo el equipo, agrupadas por profesional.
        </p>
      </header>

      {/* Navegación por día (objetivos de 40 px ≥ 24 px, WCAG SC 2.5.8). */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={goToPreviousDay} aria-label="Día anterior">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>

        <div className="flex-1 text-center">
          <p className="text-sm font-semibold capitalize text-foreground">
            {capitalize(DAY_FMT.format(day))}
          </p>
          {dayIsToday ? (
            <p className="mt-0.5 text-xs font-medium text-primary">Hoy</p>
          ) : (
            <button
              type="button"
              onClick={goToToday}
              className="mt-0.5 rounded px-2 py-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Volver a hoy
            </button>
          )}
        </div>

        <Button variant="outline" size="icon" onClick={goToNextDay} aria-label="Día siguiente">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      {/* Región de estado accesible: anuncia carga/errores/recuentos al cambiar de día. */}
      <p className="sr-only" role="status" aria-live="polite">
        {isLoading
          ? 'Cargando la agenda del salón.'
          : isError
            ? 'No se pudo cargar la agenda.'
            : `${countsLabel} para ${capitalize(DAY_FMT.format(day))}.`}
      </p>

      {isLoading ? (
        <LoadingState message="Cargando la agenda…" />
      ) : isError ? (
        <ErrorState
          title="No se pudo cargar la agenda"
          message="Hubo un problema al obtener las citas del salón."
          onRetry={() => void refetch()}
        />
      ) : total === 0 ? (
        <EmptyState
          icon={<CalendarOff className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />}
          title="Sin citas este día"
          message="No hay ninguna cita programada para la fecha seleccionada."
        />
      ) : (
        <div
          className={cn('space-y-5', isFetching && 'opacity-60 transition-opacity')}
          aria-busy={isFetching}
        >
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {countsLabel}
          </p>

          {groups.map((group) => (
            <ProfessionalSection key={group.professionalId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Sección de un profesional: cabecera con su color de marca + su lista de citas del día. */
function ProfessionalSection({ group }: { group: ProfessionalGroup }) {
  const name = professionalDisplayName(group);
  const color = group.professional?.color ?? null;
  const count = group.appointments.length;
  const headingId = `agenda-pro-${group.professionalId}`;

  return (
    <section aria-labelledby={headingId} className="animate-slide-up">
      <div className="mb-2 flex items-center gap-2">
        {/* Punto de color como IDENTIFICADOR del profesional (siempre junto a su nombre en
            texto: el color nunca es el único portador de significado). */}
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-2 ring-background"
          style={{ backgroundColor: color ?? 'hsl(var(--muted-foreground))' }}
          aria-hidden="true"
        />
        <h2 id={headingId} className="text-sm font-semibold text-foreground">
          {name}
        </h2>
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? 'cita' : 'citas'}
        </span>
      </div>

      <ul
        className="space-y-2 border-l-2 pl-3"
        style={{ borderColor: color ?? 'hsl(var(--border))' }}
      >
        {group.appointments.map((appointment) => (
          <li key={appointment.id}>
            <AppointmentCard appointment={appointment} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tarjeta de una cita: franja horaria, cliente, servicio y estado (badge con texto). */
function AppointmentCard({ appointment }: { appointment: AppointmentListItem }) {
  const inactive = INACTIVE_STATUSES.has(appointment.status);
  const customerName = appointment.customer?.fullName ?? 'Cliente';
  const serviceName = appointment.service?.name ?? 'Servicio';

  return (
    <div className={cn('rounded-xl border border-border bg-card p-3', inactive && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p
            className={cn(
              'flex items-center gap-1.5 text-sm font-semibold text-foreground',
              inactive && 'line-through',
            )}
          >
            <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {formatTimeRange(appointment.startsAt, appointment.endsAt)}
          </p>
          <p className="truncate text-sm text-foreground">{customerName}</p>
          <p className="truncate text-xs text-muted-foreground">{serviceName}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[appointment.status]} className="shrink-0">
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </Badge>
      </div>
    </div>
  );
}
