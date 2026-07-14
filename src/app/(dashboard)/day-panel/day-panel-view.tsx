"use client";

import { useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Loader2,
  WifiOff,
} from "lucide-react";

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
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-apple-out";

  if (status === "connected") {
    return (
      <span
        className={`${base} border-success/25 bg-success/10 text-success`}
        title="Los cambios se reflejan al instante"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
        Tiempo real activo
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={`${base} border-destructive/25 bg-destructive/10 text-destructive`}>
        <WifiOff className="h-3.5 w-3.5" />
        Sin conexión en tiempo real
      </span>
    );
  }
  return (
    <span className={`${base} border-border bg-muted text-muted-foreground`}>
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

  const isToday = date === today;

  return (
    <main className="container py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Panel del día</h1>
          <p className="text-sm text-muted-foreground">
            Flujo de trabajo por profesional · actualización en tiempo real
          </p>
        </div>
        <RealtimeIndicator status={realtimeStatus} />
      </div>

      {/* Barra de control: navegación de fecha + resumen del día */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        {/* Navegación de fecha (control segmentado) */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-lg border border-border/70 bg-card p-1 shadow-xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md"
              onClick={() => setDate(addDays(date, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Día anterior</span>
            </Button>
            <Button
              variant={isToday ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-md px-3 text-xs font-semibold"
              onClick={() => setDate(today)}
            >
              Hoy
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md"
              onClick={() => setDate(addDays(date, 1))}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Día siguiente</span>
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium capitalize text-foreground">
              {formatLongDate(date, timezone)}
            </span>
            {isToday && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                Hoy
              </span>
            )}
          </div>
        </div>

        {/* Resumen del día */}
        {appointmentsQuery.isSuccess && totalAppointments > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <StatPill
              value={totalAppointments}
              label={`cita${totalAppointments !== 1 ? "s" : ""}`}
              tone="neutral"
            />
            {pendingCount > 0 && (
              <StatPill
                value={pendingCount}
                label={`pendiente${pendingCount !== 1 ? "s" : ""}`}
                tone="warning"
              />
            )}
            {confirmedCount > 0 && (
              <StatPill
                value={confirmedCount}
                label={`confirmada${confirmedCount !== 1 ? "s" : ""}`}
                tone="primary"
              />
            )}
          </div>
        )}
      </div>

      {/* Skeletons de carga */}
      {(appointmentsQuery.isPending || professionalsQuery.isPending) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border/70 bg-card p-4 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="ml-auto h-5 w-6 rounded-full" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {appointmentsQuery.isError && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-12 text-center">
          <WifiOff className="h-8 w-8 text-destructive/70" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">
              No se pudieron cargar las citas
            </p>
            <p className="text-xs text-muted-foreground">
              {(appointmentsQuery.error as Error).message}
            </p>
          </div>
        </div>
      )}

      {/* Sin citas */}
      {appointmentsQuery.isSuccess && totalAppointments === 0 && (
        <div className="flex animate-fade-in flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <CalendarRange className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-foreground">
              {isToday ? "Día despejado" : "Sin citas este día"}
            </h2>
            <p className="mx-auto max-w-xs text-sm text-muted-foreground">
              No hay citas programadas
              {isToday ? " para hoy. Disfruta de la calma o adelanta trabajo." : " en esta fecha."}
            </p>
          </div>
        </div>
      )}

      {/* Grid de columnas por profesional */}
      {appointmentsByProfessional && totalAppointments > 0 && (
        <div className="grid animate-fade-up gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

// --- Píldora de estadística del día ------------------------------------------

interface StatPillProps {
  value: number;
  label: string;
  tone: "neutral" | "warning" | "primary";
}

const STAT_TONES: Record<StatPillProps["tone"], string> = {
  neutral: "border-border bg-card text-foreground",
  warning: "border-warning/30 bg-warning/10 text-warning",
  primary: "border-primary/25 bg-primary/10 text-primary",
};

function StatPill({ value, label, tone }: StatPillProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${STAT_TONES[tone]}`}
    >
      <span className="text-sm font-semibold tabular-nums leading-none">{value}</span>
      {label}
    </span>
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
    <Card className="flex flex-col overflow-hidden">
      {/* Franja de color del profesional (o acento por defecto) */}
      <span
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: color ?? "hsl(var(--primary))" }}
        aria-hidden
      />
      <CardHeader className="p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
            style={{ backgroundColor: color ?? "hsl(var(--muted-foreground))" }}
          />
          <span className="truncate">{name}</span>
          <Badge
            variant="secondary"
            className="ml-auto shrink-0 tabular-nums text-xs"
          >
            {appointments.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 p-4 pt-0">
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

// Acento lateral por estado: guía visual del flujo del día de un vistazo.
const STATUS_ACCENT: Record<AppointmentStatus, string> = {
  pending: "border-l-warning",
  confirmed: "border-l-primary",
  completed: "border-l-success",
  cancelled: "border-l-border",
  no_show: "border-l-border",
};

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
        "rounded-lg border border-l-[3px] bg-background/60 p-3 text-sm transition-all duration-200 ease-apple-out hover:border-border hover:shadow-xs",
        STATUS_ACCENT[appt.status],
        isDone && "opacity-70",
        isCancelled && "opacity-55",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Hora y estado */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums tracking-tight">
          {formatSlotTime(appt.starts_at, timezone)}
          <span className="text-muted-foreground"> – </span>
          {formatSlotTime(appt.ends_at, timezone)}
        </span>
        <Badge
          variant={STATUS_VARIANTS[appt.status]}
          className="shrink-0 text-[0.7rem]"
        >
          {STATUS_LABELS[appt.status]}
        </Badge>
      </div>

      {/* Servicio */}
      <p className="font-medium leading-tight text-foreground">
        {appt.service?.name ?? "—"}
      </p>

      {/* Cliente */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
        <span>{appt.customer?.full_name ?? "—"}</span>
        {appt.customer?.phone && (
          <span className="text-xs tabular-nums text-muted-foreground/80">
            {appt.customer.phone}
          </span>
        )}
      </div>

      {/* Precio */}
      <p className="mt-1 text-xs font-medium tabular-nums text-muted-foreground">
        {formatPrice(appt.price_cents, appt.currency)}
      </p>

      {/* Motivo de cancelación */}
      {isCancelled && appt.cancelled_reason && (
        <p className="mt-1.5 border-t border-border/60 pt-1.5 text-xs italic text-muted-foreground">
          Motivo: {appt.cancelled_reason}
        </p>
      )}

      {/* Acciones */}
      {isActive && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {isPending && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs"
              disabled={mutating}
              onClick={() => onStatusChange(appt.id, "confirmed")}
            >
              Confirmar
            </Button>
          )}
          {isConfirmed && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs"
              disabled={mutating}
              onClick={() => onStatusChange(appt.id, "completed")}
            >
              Completar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={mutating}
            onClick={() => onStatusChange(appt.id, "no_show")}
          >
            No acudió
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
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
