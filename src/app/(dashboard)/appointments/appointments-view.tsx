"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Euro,
  MessageCircle,
  Phone,
  Plus,
  Scissors,
  StickyNote,
  Trash2,
  User,
} from "lucide-react";

import { AppointmentForm } from "@/app/(dashboard)/appointments/appointment-form";
import {
  CalendarView,
  type CalendarMode,
} from "@/app/(dashboard)/appointments/calendar-view";
import { RescheduleDialog } from "@/app/(dashboard)/appointments/reschedule-dialog";
import {
  AppointmentStatusBadge,
  appointmentStatusAccent,
} from "@/components/appointments/appointment-status";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatLongDate, formatPrice, formatSlotTime } from "@/lib/booking/format";
import { localDateInZone } from "@/lib/booking/timezone";
import {
  useAppointments,
  useDeleteAppointment,
  useProfessionals,
  useSendAppointmentReminder,
  useUpdateAppointmentStatus,
} from "@/hooks/use-appointments";
import { useDayPanelRealtime } from "@/hooks/use-day-panel-realtime";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { AppointmentStatus } from "@/types/database";

interface AppointmentsViewProps {
  salonId: string;
  salonSlug: string;
  timezone: string;
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function AppointmentsView({
  salonId,
  salonSlug,
  timezone,
}: AppointmentsViewProps): React.ReactElement {
  const today = localDateInZone(timezone);

  const [date, setDate] = useState<string>(today);
  const [view, setView] = useState<"dia" | CalendarMode>("dia");
  const [filterProfessionalId, setFilterProfessionalId] = useState<string | null>(null);
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

  const appointmentsQuery = useAppointments(salonId, date, timezone, filterProfessionalId);
  const professionalsQuery = useProfessionals(salonId);
  const statusMutation = useUpdateAppointmentStatus(salonId, date, filterProfessionalId);
  const deleteMutation = useDeleteAppointment(salonId, date, filterProfessionalId);
  // Tiempo real: al crear/mover/cancelar una cita (p. ej. Sara la coge por teléfono),
  // Supabase Realtime invalida la caché y la lista se actualiza sola, sin recargar.
  const realtimeStatus = useDayPanelRealtime(salonId);
  const reminderMutation = useSendAppointmentReminder();
  const [reminderResult, setReminderResult] = useState<{
    appointmentId: string;
    message: string;
    isError: boolean;
  } | null>(null);

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

  return (
    <main className="container max-w-4xl py-10 sm:py-12">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 animate-fade-in">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Citas</h1>
          <p className="flex items-center gap-2 text-muted-foreground">
            Agenda del salón
            {realtimeStatus === "connected" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                En directo
              </span>
            )}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button onClick={() => setCreateOpen(true)} className="shadow-brand">
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

      {/* Conmutador de vista: día · semana · mes · año */}
      <div className="mb-5 flex flex-wrap gap-2 animate-fade-in">
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
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-apple-out",
              view === value
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {labelText}
          </button>
        ))}
      </div>

      {view !== "dia" ? (
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
      ) : null}

      {/* Contenido de la vista DÍA: navegación de fecha + filtro + lista */}
      {view === "dia" && (
        <>
      <div className="mb-5 flex flex-wrap items-center gap-3 animate-fade-in">
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
        <span className="text-sm font-medium capitalize text-foreground/80">
          {formatLongDate(date, timezone)}
        </span>
      </div>

      {/* Filtro por profesional */}
      {professionalsQuery.data && professionalsQuery.data.length > 1 && (
        <div className="mb-7 flex flex-wrap gap-2 animate-fade-in">
          <button
            type="button"
            onClick={() => setFilterProfessionalId(null)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-apple-out",
              filterProfessionalId === null
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            Todos
          </button>
          {professionalsQuery.data.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setFilterProfessionalId(p.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-apple-out",
                filterProfessionalId === p.id
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {p.color && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: p.color }}
                />
              )}
              {p.full_name}
            </button>
          ))}
        </div>
      )}

      {/* Lista de citas */}
      {appointmentsQuery.isPending && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {appointmentsQuery.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(appointmentsQuery.error as Error).message}
        </div>
      )}

      {appointmentsQuery.isSuccess && appointmentsQuery.data.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-muted/30 px-6 py-16 text-center animate-fade-up">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CalendarRange className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-foreground">Sin citas este día</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            No hay citas programadas. Crea una nueva o cambia de fecha.
          </p>
        </div>
      )}

      {appointmentsQuery.isSuccess && appointmentsQuery.data.length > 0 && (
        <div className="space-y-3">
          {appointmentsQuery.data.map((appt, i) => (
            <div
              key={appt.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
            >
              <AppointmentCard
                appointment={appt}
                timezone={timezone}
                onStatusChange={handleStatusChange}
                onReschedule={(a) =>
                  setRescheduleState({ open: true, appointment: a })
                }
                onDelete={handleDelete}
                mutating={statusMutation.isPending}
                onSendReminder={handleSendReminder}
                reminderPending={
                  reminderMutation.isPending && reminderMutation.variables === appt.id
                }
                reminderResult={
                  reminderResult?.appointmentId === appt.id ? reminderResult : null
                }
              />
            </div>
          ))}
        </div>
      )}
        </>
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
    </main>
  );
}

// --- Tarjeta individual de cita -----------------------------------------------

interface AppointmentCardProps {
  appointment: AppointmentWithDetails;
  timezone: string;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onReschedule: (appointment: AppointmentWithDetails) => void;
  onDelete: (appointment: AppointmentWithDetails) => void;
  mutating: boolean;
  onSendReminder: (id: string) => void;
  reminderPending: boolean;
  reminderResult: { message: string; isError: boolean } | null;
}

function AppointmentCard({
  appointment: appt,
  timezone,
  onStatusChange,
  onReschedule,
  onDelete,
  mutating,
  onSendReminder,
  reminderPending,
  reminderResult,
}: AppointmentCardProps): React.ReactElement {
  const isPending = appt.status === "pending";
  const isConfirmed = appt.status === "confirmed";
  const isActive = isPending || isConfirmed;
  const isCompleted = appt.status === "completed";
  const isMuted = appt.status === "cancelled" || appt.status === "no_show";

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-200 ease-apple-out",
        isActive && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        isMuted && "opacity-70",
      )}
    >
      {/* Franja de acento por estado */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          appointmentStatusAccent(appt.status),
        )}
      />

      <div className="flex flex-col gap-4 py-4 pl-6 pr-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              {formatSlotTime(appt.starts_at, timezone)}
              <span className="text-muted-foreground">–</span>
              {formatSlotTime(appt.ends_at, timezone)}
            </span>
            <AppointmentStatusBadge status={appt.status} />
          </div>

          <p className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Scissors className="h-4 w-4 shrink-0 text-primary/70" />
            {appt.service?.name ?? "—"}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {appt.customer?.full_name ?? "—"}
            </span>
            {appt.customer?.phone && (
              <span className="flex items-center gap-1.5 tabular-nums">
                <Phone className="h-3.5 w-3.5" />
                {appt.customer.phone}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {appt.professional?.full_name ?? "—"}
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            <span className="font-medium text-foreground/70 tabular-nums">
              {formatPrice(appt.price_cents, appt.currency)}
            </span>
          </p>

          {appt.notes && appt.notes.trim() !== "" && (
            <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-foreground/80">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="whitespace-pre-wrap">{appt.notes}</span>
            </p>
          )}

          {appt.status === "cancelled" && appt.cancelled_reason && (
            <p className="text-xs italic text-muted-foreground">
              Motivo: {appt.cancelled_reason}
            </p>
          )}

          {reminderResult && (
            <p
              className={cn(
                "text-xs",
                reminderResult.isError ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {reminderResult.message}
            </p>
          )}
        </div>

        {isActive && (
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
            <Button
              size="sm"
              variant="outline"
              disabled={reminderPending || mutating}
              onClick={() => onSendReminder(appt.id)}
            >
              <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
              {reminderPending ? "Enviando…" : "Enviar recordatorio"}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/tpv?appointment=${appt.id}`}>
                <Euro className="mr-1.5 h-3.5 w-3.5" />
                Cobrar
              </Link>
            </Button>
            {isPending && (
              <Button
                size="sm"
                disabled={mutating}
                onClick={() => onStatusChange(appt.id, "confirmed")}
              >
                Confirmar
              </Button>
            )}
            {isConfirmed && (
              <Button
                size="sm"
                disabled={mutating}
                onClick={() => onStatusChange(appt.id, "completed")}
              >
                Completar
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={mutating}
              onClick={() => onReschedule(appt)}
            >
              Reprogramar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={mutating}
              onClick={() => onStatusChange(appt.id, "no_show")}
            >
              No presentado
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={mutating}
              onClick={() => onStatusChange(appt.id, "cancelled")}
            >
              Cancelar
            </Button>
          </div>
        )}

        {isCompleted && (
          <div className="flex sm:flex-col sm:items-stretch">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/tpv?appointment=${appt.id}`}>
                <Euro className="mr-1.5 h-3.5 w-3.5" />
                Cobrar
              </Link>
            </Button>
          </div>
        )}

        {appt.status === "cancelled" && (
          <div className="flex sm:flex-col sm:items-stretch">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(appt)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Borrar
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
