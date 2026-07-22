import { useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, isSameDay, isSameWeek } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Scissors,
  User,
  Users,
} from 'lucide-react';

import { useSalonId } from '@/lib/salon-context';
import { DEFAULT_WEEK_STARTS_ON, type AppointmentListItem } from '@/lib/appointments';
import { useDayAppointments, useWeekAppointments } from '@/hooks/use-appointments';
import { fetchProfessionals } from '@/lib/professionals-queries';
import type { ProfessionalListItem } from '@/lib/professionals';
import {
  formatDayHeading,
  formatTime,
  formatWeekHeading,
  groupByLocalDay,
  statusMeta,
} from '@/lib/employee-agenda';
import { LoadingState } from '@/components/staff/LoadingState';
import { ErrorState } from '@/components/staff/ErrorState';
import { EmptyState } from '@/components/staff/EmptyState';
import { AgendaReadOnlyNotice } from '@/components/staff/AgendaReadOnlyNotice';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ⚠️ NOTA DE DISEÑO — vínculo usuario↔profesional PENDIENTE.
// La subtarea pedía mostrar "la agenda del profesional autenticado". La auditoría de esquema
// (docs/HAT3X-031-auditoria-esquema-salon-os.md, Hallazgo 1) concluyó que HOY NO es posible:
// `professionals.user_id` es nullable, sin FK a `auth.users` y sin poblar, así que desde la
// sesión (`auth.uid`) NO se puede saber "qué profesional soy". Por eso esta pantalla NO usa la
// identidad del usuario para filtrar y ofrece un SELECTOR de profesional (con la limitación
// marcada como pendiente en la UI). Cuando se pueble `user_id` + FK, se podrá autoseleccionar.

type AgendaView = 'day' | 'week';

// Identidades estables para que los `?? []` no cambien de referencia en cada render (evita
// recomputar memos / disparar efectos sin necesidad).
const EMPTY_PROFESSIONALS: ProfessionalListItem[] = [];
const EMPTY_APPOINTMENTS: AppointmentListItem[] = [];

// Recuerda el profesional elegido por salón (no hay autovínculo, así se evita repetir la
// selección en cada visita). Namespaced por salon_id; degrada en silencio si no hay storage.
function storageKey(salonId: string): string {
  return `denueveanueve.employee-agenda.professional.${salonId}`;
}
function readStoredProfessional(salonId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(salonId));
  } catch {
    return null;
  }
}
function writeStoredProfessional(salonId: string, professionalId: string): void {
  try {
    window.localStorage.setItem(storageKey(salonId), professionalId);
  } catch {
    /* almacenamiento no disponible: la selección simplemente no persiste */
  }
}

export default function EmployeeCalendar() {
  const salonId = useSalonId();

  const [view, setView] = useState<AgendaView>('day');
  const [refDate, setRefDate] = useState<Date>(() => new Date());
  const [manualProfessionalId, setManualProfessionalId] = useState<string | null>(() =>
    readStoredProfessional(salonId),
  );

  // Personal activo del salón para el selector. Consulta en línea (sin hook compartido) para
  // no acoplar esta pantalla a otras vistas en construcción.
  const professionalsQuery = useQuery({
    queryKey: ['professionals', salonId, 'active'],
    queryFn: ({ signal }) => fetchProfessionals({ salonId, activeOnly: true, signal }),
    enabled: Boolean(salonId),
    staleTime: 5 * 60 * 1000,
  });
  const professionals = professionalsQuery.data ?? EMPTY_PROFESSIONALS;

  // Profesional efectivo: la selección manual (si sigue siendo válida) o, por comodidad, el
  // único profesional cuando solo hay uno. Validar contra la lista descarta un id guardado que
  // ya no exista (profesional dado de baja) en vez de consultar por un profesional fantasma.
  const effectiveProfessionalId = useMemo<string | null>(() => {
    if (manualProfessionalId && professionals.some((p) => p.id === manualProfessionalId)) {
      return manualProfessionalId;
    }
    if (professionals.length === 1) return professionals[0].id;
    return null;
  }, [manualProfessionalId, professionals]);

  const selectedProfessional =
    professionals.find((p) => p.id === effectiveProfessionalId) ?? null;
  const hasProfessional = Boolean(effectiveProfessionalId);

  // Persiste la selección efectiva para la próxima visita.
  useEffect(() => {
    if (effectiveProfessionalId) writeStoredProfessional(salonId, effectiveProfessionalId);
  }, [salonId, effectiveProfessionalId]);

  // Ambas consultas se declaran siempre (reglas de hooks); `enabled` decide cuál se ejecuta
  // según la vista y solo cuando hay un profesional seleccionado.
  const dayQuery = useDayAppointments(refDate, {
    professionalId: effectiveProfessionalId ?? undefined,
    enabled: view === 'day' && hasProfessional,
  });
  const weekQuery = useWeekAppointments(refDate, {
    professionalId: effectiveProfessionalId ?? undefined,
    enabled: view === 'week' && hasProfessional,
  });
  const agenda = view === 'day' ? dayQuery : weekQuery;
  const appointments = agenda.data ?? EMPTY_APPOINTMENTS;
  const weekGroups = useMemo(() => groupByLocalDay(appointments), [appointments]);

  const now = new Date();
  const isCurrentPeriod =
    view === 'day'
      ? isSameDay(refDate, now)
      : isSameWeek(refDate, now, { weekStartsOn: DEFAULT_WEEK_STARTS_ON });

  function shiftPeriod(delta: number) {
    setRefDate((prev) => (view === 'day' ? addDays(prev, delta) : addWeeks(prev, delta)));
  }

  const periodLabel =
    view === 'day' ? formatDayHeading(refDate) : formatWeekHeading(refDate);
  const accentColor = selectedProfessional?.color ?? null;

  return (
    <div className="px-4 pt-6 pb-4">
      <header className="mb-5 animate-slide-up">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <CalendarDays className="h-6 w-6 text-primary" aria-hidden="true" />
          Mi agenda
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tus citas {view === 'day' ? 'del día' : 'de la semana'}, ordenadas por hora.
        </p>
      </header>

      {/* Solo visualización en esta fase: la acción de crear queda presente pero inactiva. */}
      <AgendaReadOnlyNotice className="mb-4 animate-slide-up" />

      {/* Selector de profesional (obligatorio: la sesión no identifica al profesional). */}
      <div className="mb-4 space-y-2">
        <Label
          htmlFor="agenda-professional"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Profesional
        </Label>
        <Select
          value={effectiveProfessionalId ?? undefined}
          onValueChange={setManualProfessionalId}
          disabled={professionalsQuery.isLoading || professionals.length === 0}
        >
          <SelectTrigger id="agenda-professional" aria-label="Seleccionar profesional">
            <SelectValue
              placeholder={
                professionalsQuery.isLoading
                  ? 'Cargando profesionales…'
                  : 'Selecciona tu profesional'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {professionals.map((professional) => (
              <SelectItem key={professional.id} value={professional.id}>
                {professional.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {professionalsQuery.isSuccess && professionals.length > 0 && (
          <p role="note" className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span>
              De momento la app no reconoce automáticamente tu ficha de profesional; selecciónala
              en la lista.
              <span className="font-medium"> (pendiente)</span>
            </span>
          </p>
        )}
      </div>

      {/* Cambio de vista día / semana. */}
      <div className="mb-3 flex gap-2" role="group" aria-label="Vista de la agenda">
        {(['day', 'week'] as const).map((option) => (
          <Button
            key={option}
            variant={view === option ? 'default' : 'outline'}
            size="sm"
            aria-pressed={view === option}
            onClick={() => setView(option)}
            className={
              view === option
                ? 'gradient-gold text-primary-foreground shadow-gold'
                : 'border-border text-foreground'
            }
          >
            {option === 'day' ? 'Día' : 'Semana'}
          </Button>
        ))}
      </div>

      {/* Navegación temporal (día/semana anterior · actual · siguiente). */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={view === 'day' ? 'Día anterior' : 'Semana anterior'}
          onClick={() => shiftPeriod(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-foreground">{periodLabel}</p>
          {!isCurrentPeriod && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setRefDate(new Date())}
            >
              {view === 'day' ? 'Ir a hoy' : 'Ir a esta semana'}
            </Button>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          aria-label={view === 'day' ? 'Día siguiente' : 'Semana siguiente'}
          onClick={() => shiftPeriod(1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      {/* Contenido: la región es aria-live para anunciar cambios al navegar entre días. */}
      <div aria-live="polite">
        {!hasProfessional ? (
          professionalsQuery.isLoading ? (
            <LoadingState message="Cargando profesionales…" />
          ) : professionalsQuery.isError ? (
            <ErrorState
              title="No se pudo cargar el personal"
              message={professionalsQuery.error?.message}
              onRetry={() => void professionalsQuery.refetch()}
            />
          ) : professionals.length === 0 ? (
            <EmptyState
              icon={<Users className="h-10 w-10 text-muted-foreground/40" />}
              title="Sin profesionales activos"
              message="Este salón todavía no tiene profesionales activos que mostrar."
            />
          ) : (
            <EmptyState
              icon={<CalendarDays className="h-10 w-10 text-muted-foreground/40" />}
              title="Elige un profesional"
              message="Selecciona tu profesional en la lista para ver su agenda."
            />
          )
        ) : agenda.isLoading ? (
          <LoadingState message="Cargando agenda…" />
        ) : agenda.isError ? (
          <ErrorState
            title="No se pudo cargar la agenda"
            message={agenda.error?.message}
            onRetry={() => void agenda.refetch()}
          />
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={<CalendarOff className="h-10 w-10 text-muted-foreground/40" />}
            title="Sin citas"
            message={
              view === 'day'
                ? 'No hay citas para este día.'
                : 'No hay citas para esta semana.'
            }
          />
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {appointments.length} {appointments.length === 1 ? 'cita' : 'citas'}
            </p>
            {view === 'day' ? (
              <AgendaList appointments={appointments} accentColor={accentColor} />
            ) : (
              <div className="space-y-6">
                {weekGroups.map((group) => (
                  <section key={group.key} aria-label={formatDayHeading(group.date)}>
                    <h2 className="mb-2 text-sm font-semibold text-foreground">
                      {formatDayHeading(group.date)}
                    </h2>
                    <AgendaList appointments={group.appointments} accentColor={accentColor} />
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Lista semántica (`<ul>`) de citas de un tramo (día o día dentro de la semana). */
function AgendaList({
  appointments,
  accentColor,
}: {
  appointments: AppointmentListItem[];
  accentColor: string | null;
}) {
  return (
    <ul className="space-y-2">
      {appointments.map((appointment) => (
        <AgendaRow key={appointment.id} appointment={appointment} accentColor={accentColor} />
      ))}
    </ul>
  );
}

/** Una cita: hora inicio–fin, cliente, servicio y estado. Acento cromático del profesional. */
function AgendaRow({
  appointment,
  accentColor,
}: {
  appointment: AppointmentListItem;
  accentColor: string | null;
}) {
  const meta = statusMeta(appointment.status);
  // Prioriza el color embebido de la cita; si no llegó, cae al del profesional seleccionado.
  const color = appointment.professional?.color ?? accentColor;
  const start = formatTime(appointment.startsAt);
  const end = formatTime(appointment.endsAt);

  return (
    <li
      className="rounded-xl border border-l-4 border-border bg-card p-4"
      style={color ? { borderLeftColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            {/* aria-label da la lectura clara "De 09:00 a 10:00"; los <time> aportan valor
                semántico legible por máquina vía dateTime. */}
            <span aria-label={`De ${start} a ${end}`}>
              <time dateTime={appointment.startsAt} aria-hidden="true">
                {start}
              </time>
              <span aria-hidden="true"> – </span>
              <time dateTime={appointment.endsAt} aria-hidden="true">
                {end}
              </time>
            </span>
          </p>

          <p className="flex items-center gap-2 text-sm text-foreground">
            <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">
              {appointment.customer?.fullName ?? 'Cliente sin nombre'}
            </span>
          </p>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Scissors className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{appointment.service?.name ?? 'Servicio'}</span>
          </p>
        </div>

        <Badge variant={meta.variant} className="flex-shrink-0">
          {meta.label}
        </Badge>
      </div>
    </li>
  );
}
