"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { AppointmentForm } from "@/app/(dashboard)/appointments/appointment-form";
import { RescheduleDialog } from "@/app/(dashboard)/appointments/reschedule-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatLongDate, formatPrice, formatSlotTime } from "@/lib/booking/format";
import { localDateInZone } from "@/lib/booking/timezone";
import {
  useAppointments,
  useProfessionals,
  useUpdateAppointmentStatus,
} from "@/hooks/use-appointments";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { AppointmentStatus } from "@/types/database";

interface AppointmentsViewProps {
  salonId: string;
  salonSlug: string;
  timezone: string;
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No presentado",
};

const STATUS_VARIANTS: Record<
  AppointmentStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  confirmed: "default",
  completed: "secondary",
  cancelled: "destructive",
  no_show: "destructive",
};

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
  const [filterProfessionalId, setFilterProfessionalId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelState, setCancelState] = useState<{
    open: boolean;
    appointmentId: string;
    reason: string;
  }>({ open: false, appointmentId: "", reason: "" });
  const [rescheduleState, setRescheduleState] = useState<{
    open: boolean;
    appointment: AppointmentWithDetails | null;
  }>({ open: false, appointment: null });

  const appointmentsQuery = useAppointments(salonId, date, timezone, filterProfessionalId);
  const professionalsQuery = useProfessionals(salonId);
  const statusMutation = useUpdateAppointmentStatus(salonId, date, filterProfessionalId);

  function handleStatusChange(id: string, status: AppointmentStatus): void {
    if (status === "cancelled") {
      setCancelState({ open: true, appointmentId: id, reason: "" });
      return;
    }
    statusMutation.mutate({ id, status });
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

  return (
    <main className="container py-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Citas</h1>
          <p className="text-muted-foreground">Agenda del salón</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button onClick={() => setCreateOpen(true)}>
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

      {/* Navegación de fecha */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Día anterior</span>
        </Button>
        <Button
          variant={date === today ? "default" : "outline"}
          size="sm"
          onClick={() => setDate(today)}
        >
          Hoy
        </Button>
        <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Día siguiente</span>
        </Button>
        <span className="ml-2 text-sm font-medium capitalize">
          {formatLongDate(date, timezone)}
        </span>
      </div>

      {/* Filtro por profesional */}
      {professionalsQuery.data && professionalsQuery.data.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterProfessionalId(null)}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
              (filterProfessionalId === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30 text-muted-foreground hover:border-primary")
            }
          >
            Todos
          </button>
          {professionalsQuery.data.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setFilterProfessionalId(p.id)}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (filterProfessionalId === p.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30 text-muted-foreground hover:border-primary")
              }
            >
              {p.color && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
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
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      )}

      {appointmentsQuery.isError && (
        <p className="text-sm text-destructive">
          {(appointmentsQuery.error as Error).message}
        </p>
      )}

      {appointmentsQuery.isSuccess && appointmentsQuery.data.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No hay citas programadas para este día.
          </p>
        </div>
      )}

      {appointmentsQuery.isSuccess && appointmentsQuery.data.length > 0 && (
        <div className="space-y-3">
          {appointmentsQuery.data.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              timezone={timezone}
              onStatusChange={handleStatusChange}
              onReschedule={(a) =>
                setRescheduleState({ open: true, appointment: a })
              }
              mutating={statusMutation.isPending}
            />
          ))}
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
  mutating: boolean;
}

function AppointmentCard({
  appointment: appt,
  timezone,
  onStatusChange,
  onReschedule,
  mutating,
}: AppointmentCardProps): React.ReactElement {
  const isPending = appt.status === "pending";
  const isConfirmed = appt.status === "confirmed";
  const isActive = isPending || isConfirmed;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">
              {formatSlotTime(appt.starts_at, timezone)}
              {" – "}
              {formatSlotTime(appt.ends_at, timezone)}
            </span>
            <Badge variant={STATUS_VARIANTS[appt.status]}>
              {STATUS_LABELS[appt.status]}
            </Badge>
          </div>
          <p className="font-medium">{appt.service?.name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">
            {appt.customer?.full_name ?? "—"}
            {appt.customer?.phone && (
              <span className="ml-2 tabular-nums">{appt.customer.phone}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {appt.professional?.full_name ?? "—"} ·{" "}
            {formatPrice(appt.price_cents, appt.currency)}
          </p>
          {appt.status === "cancelled" && appt.cancelled_reason && (
            <p className="text-xs text-muted-foreground">
              Motivo: {appt.cancelled_reason}
            </p>
          )}
        </div>

        {isActive && (
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            {isPending && (
              <Button
                size="sm"
                variant="outline"
                disabled={mutating}
                onClick={() => onStatusChange(appt.id, "confirmed")}
              >
                Confirmar
              </Button>
            )}
            {isConfirmed && (
              <Button
                size="sm"
                variant="outline"
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
              variant="destructive"
              disabled={mutating}
              onClick={() => onStatusChange(appt.id, "cancelled")}
            >
              Cancelar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
