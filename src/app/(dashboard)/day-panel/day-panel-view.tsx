"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Wifi, WifiOff, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatLongDate, formatPrice, formatSlotTime } from "@/lib/booking/format";
import { localDateInZone } from "@/lib/booking/timezone";
import { useDayPanelRealtime } from "@/hooks/use-day-panel-realtime";
import {
  useAppointments,
  useProfessionals,
  useUpdateAppointmentStatus,
} from "@/hooks/use-appointments";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { AppointmentStatus } from "@/types/database";

interface DayPanelViewProps {
  salonId: string;
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

function RealtimeIndicator({
  status,
}: {
  status: "connecting" | "connected" | "error";
}): React.ReactElement {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600">
        <Wifi className="h-3.5 w-3.5" />
        Tiempo real activo
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <WifiOff className="h-3.5 w-3.5" />
        Sin conexión en tiempo real
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Conectando…
    </span>
  );
}

export function DayPanelView({
  salonId,
  timezone,
}: DayPanelViewProps): React.ReactElement {
  const today = localDateInZone(timezone);
  const [date, setDate] = useState<string>(today);
  const [cancelState, setCancelState] = useState<{
    open: boolean;
    appointmentId: string;
    reason: string;
  }>({ open: false, appointmentId: "", reason: "" });

  const realtimeStatus = useDayPanelRealtime(salonId);
  const appointmentsQuery = useAppointments(salonId, date, timezone, null);
  const professionalsQuery = useProfessionals(salonId);
  const statusMutation = useUpdateAppointmentStatus(salonId, date, null);

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

  // Agrupar citas por profesional manteniendo el orden del catálogo.
  const appointmentsByProfessional = (() => {
    if (!appointmentsQuery.data || !professionalsQuery.data) return null;

    const map = new Map<
      string,
      { name: string; color: string | null; appointments: AppointmentWithDetails[] }
    >();

    for (const pro of professionalsQuery.data) {
      map.set(pro.id, { name: pro.full_name, color: pro.color, appointments: [] });
    }

    for (const appt of appointmentsQuery.data) {
      const proId = appt.professional_id;
      if (!map.has(proId)) {
        map.set(proId, {
          name: appt.professional?.full_name ?? "Sin profesional",
          color: appt.professional?.color ?? null,
          appointments: [],
        });
      }
      map.get(proId)!.appointments.push(appt);
    }

    return [...map.values()];
  })();

  const totalAppointments = appointmentsQuery.data?.length ?? 0;
  const pendingCount =
    appointmentsQuery.data?.filter((a) => a.status === "pending").length ?? 0;
  const confirmedCount =
    appointmentsQuery.data?.filter((a) => a.status === "confirmed").length ?? 0;

  return (
    <main className="container py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panel del día</h1>
          <p className="text-muted-foreground">
            Vista por profesional · actualización en tiempo real
          </p>
        </div>
        <RealtimeIndicator status={realtimeStatus} />
      </div>

      {/* Navegación de fecha */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
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

      {/* Resumen del día */}
      {appointmentsQuery.isSuccess && totalAppointments > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Badge variant="outline" className="px-3 py-1 text-sm">
            {totalAppointments} cita{totalAppointments !== 1 ? "s" : ""}
          </Badge>
          {pendingCount > 0 && (
            <Badge
              variant="outline"
              className="border-yellow-400 px-3 py-1 text-sm text-yellow-700"
            >
              {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {confirmedCount > 0 && (
            <Badge className="px-3 py-1 text-sm">
              {confirmedCount} confirmada{confirmedCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}

      {/* Skeletons de carga */}
      {(appointmentsQuery.isPending || professionalsQuery.isPending) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-40 rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {appointmentsQuery.isError && (
        <p className="text-sm text-destructive">
          {(appointmentsQuery.error as Error).message}
        </p>
      )}

      {/* Sin citas */}
      {appointmentsQuery.isSuccess && totalAppointments === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No hay citas programadas para este día.
          </p>
        </div>
      )}

      {/* Grid de columnas por profesional */}
      {appointmentsByProfessional && totalAppointments > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {appointmentsByProfessional
            .filter((col) => col.appointments.length > 0)
            .map((col) => (
              <ProfessionalColumn
                key={col.name}
                name={col.name}
                color={col.color}
                appointments={col.appointments}
                timezone={timezone}
                onStatusChange={handleStatusChange}
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
                onChange={(e) =>
                  setCancelState((s) => ({ ...s, reason: e.target.value }))
                }
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
    </main>
  );
}

// --- Columna de profesional --------------------------------------------------

interface ProfessionalColumnProps {
  name: string;
  color: string | null;
  appointments: AppointmentWithDetails[];
  timezone: string;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  mutating: boolean;
}

function ProfessionalColumn({
  name,
  color,
  appointments,
  timezone,
  onStatusChange,
  mutating,
}: ProfessionalColumnProps): React.ReactElement {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {color && (
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
          )}
          {name}
          <Badge variant="secondary" className="ml-auto text-xs">
            {appointments.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {appointments.map((appt) => (
          <AppointmentSlot
            key={appt.id}
            appointment={appt}
            timezone={timezone}
            onStatusChange={onStatusChange}
            mutating={mutating}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// --- Tarjeta individual de cita ---------------------------------------------

interface AppointmentSlotProps {
  appointment: AppointmentWithDetails;
  timezone: string;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  mutating: boolean;
}

function AppointmentSlot({
  appointment: appt,
  timezone,
  onStatusChange,
  mutating,
}: AppointmentSlotProps): React.ReactElement {
  const isPending = appt.status === "pending";
  const isConfirmed = appt.status === "confirmed";
  const isActive = isPending || isConfirmed;
  const isDone = appt.status === "completed";
  const isCancelled = appt.status === "cancelled" || appt.status === "no_show";

  return (
    <div
      className={[
        "rounded-lg border p-3 text-sm transition-opacity",
        isDone && "opacity-60",
        isCancelled && "opacity-40",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Hora y estado */}
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="font-semibold tabular-nums">
          {formatSlotTime(appt.starts_at, timezone)}
          {" – "}
          {formatSlotTime(appt.ends_at, timezone)}
        </span>
        <Badge variant={STATUS_VARIANTS[appt.status]} className="shrink-0 text-xs">
          {STATUS_LABELS[appt.status]}
        </Badge>
      </div>

      {/* Servicio */}
      <p className="font-medium leading-tight">{appt.service?.name ?? "—"}</p>

      {/* Cliente */}
      <p className="mt-0.5 text-muted-foreground">
        {appt.customer?.full_name ?? "—"}
        {appt.customer?.phone && (
          <span className="ml-1.5 text-xs tabular-nums">{appt.customer.phone}</span>
        )}
      </p>

      {/* Precio */}
      <p className="mt-0.5 text-xs text-muted-foreground">
        {formatPrice(appt.price_cents, appt.currency)}
      </p>

      {/* Motivo de cancelación */}
      {isCancelled && appt.cancelled_reason && (
        <p className="mt-1 text-xs italic text-muted-foreground">
          Motivo: {appt.cancelled_reason}
        </p>
      )}

      {/* Acciones */}
      {isActive && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isPending && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
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
              className="h-7 px-2 text-xs"
              disabled={mutating}
              onClick={() => onStatusChange(appt.id, "completed")}
            >
              Completar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={mutating}
            onClick={() => onStatusChange(appt.id, "no_show")}
          >
            No acudió
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2 text-xs"
            disabled={mutating}
            onClick={() => onStatusChange(appt.id, "cancelled")}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
