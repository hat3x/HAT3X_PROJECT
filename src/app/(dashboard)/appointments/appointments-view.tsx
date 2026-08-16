"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";

import { AppointmentForm } from "@/app/(dashboard)/appointments/appointment-form";
import {
  CalendarView,
  type CalendarMode,
} from "@/app/(dashboard)/appointments/calendar-view";
import { RescheduleDialog } from "@/app/(dashboard)/appointments/reschedule-dialog";
import { AgendaDayKpis } from "@/components/agenda/agenda-day-kpis";
import { AgendaSidePanel } from "@/components/agenda/agenda-side-panel";
import { AppointmentDrawer } from "@/components/agenda/appointment-drawer";
import { DayGrid } from "@/components/agenda/day-grid";
import { WeekGrid } from "@/components/agenda/week-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { localDateInZone, weekdayOfLocalDate, zonedWallTimeToUtc } from "@/lib/booking/timezone";
import {
  useAppointments,
  useDeleteAppointment,
  useProfessionals,
  useRescheduleAppointment,
  useSendAppointmentReminder,
  useUpdateAppointmentNotes,
  useUpdateAppointmentStatus,
} from "@/hooks/use-appointments";
import { useSalonSchedule } from "@/hooks/use-schedules";
import { useDayPanelRealtime } from "@/hooks/use-day-panel-realtime";
import { useOverdueOrtho } from "@/hooks/use-ortho-payments";
import type { OpeningRange } from "@/lib/agenda/day-model";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { AppointmentStatus, MemberRole, SalonSector } from "@/types/database";

interface AppointmentsViewProps {
  salonId: string;
  salonSlug: string;
  timezone: string;
  sector: SalonSector;
  role: MemberRole | null;
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene `dateStr` (ISO "YYYY-MM-DD"). */
function mondayOf(dateStr: string): string {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Dom … 6=Sáb
  return addDays(dateStr, -((day + 6) % 7));
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Fecha `YYYY-MM-DD` → las dos líneas de la barra superior (mockup
 * `.curdate`): grande = "Martes 12" (día de la semana + número), pequeña =
 * "Agosto 2026" (mes + año). Cada parte se pide por separado a
 * `Intl.DateTimeFormat` para no depender de los conectores del formato largo
 * (p. ej. "de") que varían según el locale.
 */
function formatTopBarDate(date: string, timeZone: string): { big: string; small: string } {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  // Mediodía UTC evita que el desfase de zona cambie el día mostrado.
  const instant = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = new Intl.DateTimeFormat("es-ES", { timeZone, weekday: "long" }).format(instant);
  const dayNumber = new Intl.DateTimeFormat("es-ES", { timeZone, day: "numeric" }).format(instant);
  const monthName = new Intl.DateTimeFormat("es-ES", { timeZone, month: "long" }).format(instant);
  const yearNumber = new Intl.DateTimeFormat("es-ES", { timeZone, year: "numeric" }).format(
    instant,
  );
  return {
    big: `${capitalize(weekday)} ${dayNumber}`,
    small: `${capitalize(monthName)} ${yearNumber}`,
  };
}

export function AppointmentsView({
  salonId,
  salonSlug,
  timezone,
  sector,
  role,
}: AppointmentsViewProps): React.ReactElement {
  const today = localDateInZone(timezone);

  const [date, setDate] = useState<string>(today);
  const [view, setView] = useState<"dia" | CalendarMode>("dia");
  const [hiddenProfIds, setHiddenProfIds] = useState<Set<string>>(new Set());
  const [monthCursor, setMonthCursor] = useState<string>(() => date.slice(0, 7));
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelState, setCancelState] = useState<{
    open: boolean;
    appointmentId: string;
    reason: string;
  }>({ open: false, appointmentId: "", reason: "" });
  const [deleteState, setDeleteState] = useState<{
    open: boolean;
    appointment: AppointmentWithDetails | null;
  }>({ open: false, appointment: null });
  const [rescheduleState, setRescheduleState] = useState<{
    open: boolean;
    appointment: AppointmentWithDetails | null;
  }>({ open: false, appointment: null });
  const [selectedAppt, setSelectedAppt] = useState<AppointmentWithDetails | null>(null);
  const [reminderResult, setReminderResult] = useState<{
    appointmentId: string;
    message: string;
    isError: boolean;
  } | null>(null);

  const appointmentsQuery = useAppointments(salonId, date, timezone, null);
  // Filtro de la barra superior (buscador "Buscar paciente…"): se aplica solo
  // a lo que se ve en la vista Día (KPIs + parrilla), no a la consulta en sí.
  const dayAppointments = (appointmentsQuery.data ?? []).filter(
    (a) =>
      search.trim() === "" ||
      (a.customer?.full_name ?? "").toLowerCase().includes(search.trim().toLowerCase()),
  );
  const dayCustomerIds = Array.from(
    new Set(
      (appointmentsQuery.data ?? [])
        .map((a) => a.customer_id)
        .filter((v): v is string => v !== null),
    ),
  );
  const overdueQuery = useOverdueOrtho(salonId, dayCustomerIds, today, sector === "odontologia");
  const overdueMap = overdueQuery.data ?? {};
  const professionalsQuery = useProfessionals(salonId);
  const allProfessionals = professionalsQuery.data ?? [];
  const visibleProfessionals = allProfessionals.filter((p) => !hiddenProfIds.has(p.id));
  const activeProfessionalIds = new Set(visibleProfessionals.map((p) => p.id));
  function toggleProfessional(id: string): void {
    setHiddenProfIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectDate(d: string): void {
    setDate(d);
    setMonthCursor(d.slice(0, 7));
  }
  function changeMonth(delta: number): void {
    const [y, m] = monthCursor.split("-").map((x) => Number.parseInt(x, 10));
    const base = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + delta, 1));
    setMonthCursor(`${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const statusMutation = useUpdateAppointmentStatus(salonId, date, null);
  const notesMutation = useUpdateAppointmentNotes(salonId, date, null);
  const deleteMutation = useDeleteAppointment(salonId, date, null);

  // Horarios de apertura de la clínica → franjas "Cerrado" en la parrilla del día.
  const scheduleQuery = useSalonSchedule(salonId);
  const openingRanges = useMemo<OpeningRange[]>(() => {
    const weekday = weekdayOfLocalDate(date);
    const toMin = (t: string): number => {
      const parts = t.split(":");
      return Number(parts[0] ?? 0) * 60 + Number(parts[1] ?? 0);
    };
    return (scheduleQuery.data ?? [])
      .filter((r) => r.weekday === weekday)
      .map((r) => ({ startMin: toMin(r.start_time), endMin: toMin(r.end_time) }));
  }, [scheduleQuery.data, date]);

  // 7 fechas (lunes → domingo) de la semana visible, para la vista Semana.
  const weekDates = useMemo(() => {
    const monday = mondayOf(date);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [date]);

  // Arrastrar/redimensionar una cita en la parrilla → reprogramar (cualquier minuto).
  const rescheduleMutation = useRescheduleAppointment(salonId);
  const [moveError, setMoveError] = useState<string | null>(null);
  function handleMoveAppointment(
    appointment: AppointmentWithDetails,
    next: { startMin: number; durationMin: number; professionalId: string },
  ): void {
    const hm = (min: number): string =>
      `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    const startsAt = zonedWallTimeToUtc(date, hm(next.startMin), timezone).toISOString();
    const endsAt = zonedWallTimeToUtc(
      date,
      hm(next.startMin + next.durationMin),
      timezone,
    ).toISOString();
    setMoveError(null);
    rescheduleMutation.mutate(
      { appointmentId: appointment.id, professionalId: next.professionalId, startsAt, endsAt },
      {
        onSuccess: (res) => {
          if (!res.ok) {
            setMoveError(res.error);
            window.setTimeout(() => setMoveError(null), 4000);
          }
        },
        onError: (err) => {
          setMoveError(err instanceof Error ? err.message : "No se pudo mover la cita");
          window.setTimeout(() => setMoveError(null), 4000);
        },
      },
    );
  }
  function handleMoveAppointmentWeek(
    appointment: AppointmentWithDetails,
    next: { date: string; startMin: number; durationMin: number },
  ): void {
    const hm = (min: number): string =>
      `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    const startsAt = zonedWallTimeToUtc(next.date, hm(next.startMin), timezone).toISOString();
    const endsAt = zonedWallTimeToUtc(
      next.date,
      hm(next.startMin + next.durationMin),
      timezone,
    ).toISOString();
    setMoveError(null);
    rescheduleMutation.mutate(
      {
        appointmentId: appointment.id,
        professionalId: appointment.professional_id,
        startsAt,
        endsAt,
      },
      {
        onSuccess: (res) => {
          if (!res.ok) {
            setMoveError(res.error);
            window.setTimeout(() => setMoveError(null), 4000);
          }
        },
        onError: (err) => {
          setMoveError(err instanceof Error ? err.message : "No se pudo mover la cita");
          window.setTimeout(() => setMoveError(null), 4000);
        },
      },
    );
  }
  const reminderMutation = useSendAppointmentReminder();
  // Tiempo real: al crear/mover/cancelar una cita (p. ej. Sara la coge por teléfono),
  // Supabase Realtime invalida la caché y la lista se actualiza sola, sin recargar.
  const realtimeStatus = useDayPanelRealtime(salonId);

  // Cita seleccionada para el drawer de detalle: se deriva de la query en
  // lugar de guardarse aparte, así refleja al vuelo cualquier cambio de
  // estado/notas (optimista o por Realtime) sin quedarse con una copia obsoleta.
  // Deriva del query del día si la cita está ahí (refleja cambios de estado al
  // instante); si no (p. ej. seleccionada en la vista Semana, otro día), usa el
  // objeto guardado.
  const selectedAppointment = selectedAppt
    ? (appointmentsQuery.data?.find((a) => a.id === selectedAppt.id) ?? selectedAppt)
    : null;

  function handleStatusChange(id: string, status: AppointmentStatus): void {
    if (status === "cancelled") {
      setCancelState({ open: true, appointmentId: id, reason: "" });
      return;
    }
    statusMutation.mutate({ id, status });
  }

  function handleDelete(appointment: AppointmentWithDetails): void {
    setDeleteState({ open: true, appointment });
  }

  function handleSendReminder(appointmentId: string): void {
    setReminderResult(null);
    reminderMutation.mutate(appointmentId, {
      onSuccess: (result) => {
        setReminderResult(
          result.ok
            ? { appointmentId, message: result.data.message, isError: false }
            : { appointmentId, message: result.error, isError: true },
        );
      },
      onError: (err) => {
        setReminderResult({
          appointmentId,
          message: err instanceof Error ? err.message : "Error al enviar el recordatorio",
          isError: true,
        });
      },
    });
  }

  function confirmCancel(): void {
    statusMutation.mutate(
      {
        id: cancelState.appointmentId,
        status: "cancelled",
        reason: cancelState.reason || undefined,
      },
      {
        onSuccess: () => setCancelState({ open: false, appointmentId: "", reason: "" }),
      },
    );
  }

  function confirmDelete(): void {
    if (!deleteState.appointment) return;
    deleteMutation.mutate(deleteState.appointment.id, {
      onSuccess: () => setDeleteState({ open: false, appointment: null }),
    });
  }

  const topBarDate = formatTopBarDate(date, timezone);

  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden lg:h-[100dvh]">
      {/* Barra superior única (mockup docs/superpowers/reference/2026-08-12-agenda-mockup.html
          → .top): navegación de fecha, indicador "en directo", conmutador de
          vista, buscador y "Nueva cita". Sustituye las tres filas previas
          (cabecera, conmutador, nav. de fecha) — así solo la parrilla hace
          scroll por debajo (ver DayGrid: h-full en vez de max-h). */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-[var(--glass-panel)] px-4 py-2.5 backdrop-blur-xl backdrop-saturate-150 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setDate(addDays(date, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Día anterior</span>
            </Button>
            <Button
              variant={date === today ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-full px-4"
              onClick={() => setDate(today)}
            >
              Hoy
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setDate(addDays(date, 1))}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Día siguiente</span>
            </Button>
          </div>

          <div className="leading-tight">
            <div className="text-base font-bold capitalize tracking-tight text-foreground">
              {topBarDate.big}
            </div>
            <div className="text-xs font-medium capitalize text-muted-foreground">
              {topBarDate.small}
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {realtimeStatus === "connected" && (
          <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-600 xl:inline-flex dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            En directo
          </span>
        )}

        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-1">
          {(
            [
              ["dia", "Día"],
              ["semana", "Semana"],
              ["mes", "Mes"],
              ["ano", "Año"],
            ] as const
          ).map(([value, labelText]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-200 ease-apple-out",
                view === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {labelText}
            </button>
          ))}
        </div>

        <div className="relative hidden min-w-0 shrink lg:block">
          <label htmlFor="agenda-patient-search" className="sr-only">
            Buscar paciente
          </label>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="agenda-patient-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar paciente…"
            className="h-9 w-full min-w-0 rounded-lg bg-muted/40 pl-8 text-sm lg:w-44 xl:w-56"
          />
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 whitespace-nowrap shadow-brand">
            <Plus className="mr-2 h-4 w-4" />
            Nueva cita
          </Button>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva cita</DialogTitle>
              <DialogDescription>
                Crea una cita desde el panel. Quedará confirmada de inmediato.
              </DialogDescription>
            </DialogHeader>
            <AppointmentForm
              salonId={salonId}
              salonSlug={salonSlug}
              timezone={timezone}
              onSuccess={() => setCreateOpen(false)}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {view === "dia" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <AgendaDayKpis appointments={dayAppointments} />
          </div>
          <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4 pt-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <DayGrid
                appointments={dayAppointments}
                professionals={visibleProfessionals}
                timezone={timezone}
                openingRanges={openingRanges}
                isToday={date === today}
                isLoading={appointmentsQuery.isPending}
                isError={appointmentsQuery.isError}
                overdueByCustomer={overdueMap}
                onSelectAppointment={(a) => setSelectedAppt(a)}
                onSelectSlot={() => setCreateOpen(true)}
                onMoveAppointment={handleMoveAppointment}
              />
            </div>
            <aside className="hidden w-[236px] shrink-0 overflow-y-auto lg:block">
              <AgendaSidePanel
                month={monthCursor}
                selectedDate={date}
                professionals={allProfessionals}
                activeProfessionalIds={activeProfessionalIds}
                onToggleProfessional={toggleProfessional}
                onSelectDate={selectDate}
                onChangeMonth={changeMonth}
              />
            </aside>
          </div>
        </div>
      ) : view === "semana" ? (
        <div className="min-h-0 flex-1 px-4 pb-4 pt-3 sm:px-6">
          <WeekGrid
            salonId={salonId}
            weekDates={weekDates}
            timezone={timezone}
            todayDate={today}
            professionals={visibleProfessionals}
            onSelectAppointment={(a) => setSelectedAppt(a)}
            onSelectSlot={(d) => {
              selectDate(d);
              setCreateOpen(true);
            }}
            onMoveAppointment={handleMoveAppointmentWeek}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          <CalendarView
            salonId={salonId}
            timezone={timezone}
            mode={view}
            date={date}
            onDateChange={setDate}
            onPickDay={(d) => {
              setDate(d);
              setView("dia");
            }}
          />
        </div>
      )}

      {/* Dialog de cancelación */}
      <Dialog
        open={cancelState.open}
        onOpenChange={(open) => {
          if (!open) setCancelState((s) => ({ ...s, open: false }));
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar cita</DialogTitle>
            <DialogDescription>
              Puedes añadir un motivo opcional. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
              <Input
                id="cancel-reason"
                value={cancelState.reason}
                onChange={(e) => setCancelState((s) => ({ ...s, reason: e.target.value }))}
                placeholder="P. ej. cliente solicitó cancelar"
              />
            </div>
            {statusMutation.isError && (
              <p className="text-sm text-destructive">
                {(statusMutation.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setCancelState((s) => ({ ...s, open: false }))}
                disabled={statusMutation.isPending}
              >
                Volver
              </Button>
              <Button
                variant="destructive"
                onClick={confirmCancel}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? "Cancelando…" : "Confirmar cancelación"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de borrado (hard delete) */}
      <Dialog
        open={deleteState.open}
        onOpenChange={(open) => {
          if (!open) setDeleteState((s) => ({ ...s, open: false }));
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar cita</DialogTitle>
            <DialogDescription>
              Se eliminará la cita por completo. Esta acción no se puede deshacer. Si solo
              quieres anularla conservando el registro, usa «Cancelar».
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {deleteState.appointment && (
              <p className="text-sm text-muted-foreground">
                {deleteState.appointment.customer?.full_name ?? "—"}
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                {deleteState.appointment.service?.name ?? "—"}
              </p>
            )}
            {deleteMutation.isError && (
              <p className="text-sm text-destructive">
                {(deleteMutation.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteState((s) => ({ ...s, open: false }))}
                disabled={deleteMutation.isPending}
              >
                Volver
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Borrando…" : "Borrar definitivamente"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de reprogramación */}
      {rescheduleState.appointment && (
        <RescheduleDialog
          open={rescheduleState.open}
          appointment={rescheduleState.appointment}
          salonId={salonId}
          salonSlug={salonSlug}
          timezone={timezone}
          onSuccess={() => setRescheduleState({ open: false, appointment: null })}
          onClose={() => setRescheduleState((s) => ({ ...s, open: false }))}
        />
      )}

      {/* Drawer de detalle — se abre al pulsar la cita; agrupa TODAS las
          acciones por cita (confirmar/completar/no presentado/reprogramar/
          recordatorio/cancelar/borrar/notas), sustituyendo el diálogo de
          notas provisional de la Fase 2. */}
      <AppointmentDrawer
        appointment={selectedAppointment}
        open={selectedAppointment !== null}
        onClose={() => setSelectedAppt(null)}
        timezone={timezone}
        patientHref={
          sector === "odontologia" && selectedAppointment
            ? `/customers/${selectedAppointment.customer_id}?tab=expediente`
            : null
        }
        payHref={selectedAppointment ? `/tpv?appointment=${selectedAppointment.id}` : "/tpv"}
        canDelete={role === "owner" || role === "manager"}
        statusPending={statusMutation.isPending}
        notesPending={notesMutation.isPending}
        reminderPending={
          reminderMutation.isPending && reminderMutation.variables === selectedAppointment?.id
        }
        reminderMessage={
          reminderResult !== null && reminderResult.appointmentId === selectedAppointment?.id
            ? { message: reminderResult.message, isError: reminderResult.isError }
            : null
        }
        onConfirm={(id) => handleStatusChange(id, "confirmed")}
        onComplete={(id) => handleStatusChange(id, "completed")}
        onNoShow={(id) => handleStatusChange(id, "no_show")}
        onReschedule={(a) => setRescheduleState({ open: true, appointment: a })}
        onSendReminder={handleSendReminder}
        onCancel={(a) => setCancelState({ open: true, appointmentId: a.id, reason: "" })}
        onDelete={handleDelete}
        onSaveNotes={(id, notes) => notesMutation.mutate({ id, notes })}
      />

      {moveError !== null ? (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground shadow-lg"
        >
          {moveError}
        </div>
      ) : null}
    </main>
  );
}
