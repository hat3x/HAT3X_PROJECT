"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, CalendarDays, StickyNote, Users } from "lucide-react";

import { AppointmentStatusBadge } from "@/components/appointments/appointment-status";
import { Skeleton } from "@/components/ui/skeleton";
import { agendaLocalMinutes, computeDayWindow } from "@/lib/agenda/day-model";
import { buildDayTimeline, snapMinutes } from "@/lib/agenda/timeline";
import { formatPrice, formatSlotTime } from "@/lib/booking/format";
import { cn } from "@/lib/utils";
import type { OpeningRange } from "@/lib/agenda/day-model";
import type { DayTimeline, TimelineItem } from "@/lib/agenda/timeline";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { AppointmentStatus } from "@/types/database";

/**
 * DayGrid — parrilla horaria del día, una columna por profesional.
 *
 * Porta la vista "Día" del mockup aprobado
 * (docs/superpowers/reference/2026-08-12-agenda-mockup.html) a Tailwind +
 * tokens de Kairos: eje de tiempo ELÁSTICO (`buildDayTimeline`) para que
 * ninguna tarjeta quede por debajo de su altura mínima legible, cabecera de
 * profesionales STICKY y OPACA con z-index alto, y el cuerpo con su propio
 * contexto de apilado (z-index 0) para que las citas queden SIEMPRE por
 * debajo de la cabecera al hacer scroll. El contenedor con scroll no lleva
 * padding-top (dejaría "bleed" tras la cabecera fija); en su lugar el
 * wrapper interior lleva margin-top.
 *
 * Puramente presentacional: no importa `@/lib/salon` (RSC boundary) ni
 * llama a hooks de datos — recibe todo por props y delega la selección de
 * cita/hueco al padre (`onSelectAppointment` / `onSelectSlot`).
 */

interface DayGridProfessional {
  id: string;
  full_name: string;
  color: string | null;
}

interface DayGridProps {
  appointments: AppointmentWithDetails[];
  professionals: DayGridProfessional[];
  timezone: string;
  isLoading: boolean;
  isError: boolean;
  overdueByCustomer?: Record<string, number>;
  onSelectAppointment: (appointment: AppointmentWithDetails) => void;
  onSelectSlot: (professionalId: string, startMin: number) => void;
}

interface PositionedAppointment {
  appointment: AppointmentWithDetails;
  startMin: number;
  durationMin: number;
}

/** Ancho de la columna de horas (gutter), en píxeles. */
const GUTTER_WIDTH = 56;
/** Ventana de fallback cuando aún no hay horario de apertura integrado (Fase 2). */
const FALLBACK_WINDOW = { startMin: 8 * 60, endMin: 21 * 60 };
/** Parámetros del eje elástico — idénticos a los del mockup aprobado. */
const TIMELINE_BASE = 1.35;
const TIMELINE_MIN_CARD = 74;
const TIMELINE_EXTRA = 40;
/** Snap al pulsar un hueco vacío (minutos). */
const SLOT_SNAP_MIN = 5;

/**
 * Tinte de fondo + borde por estado para la tarjeta, con los MISMOS tokens
 * semánticos que `appointment-status.tsx` usa para su píldora (bg-X/12
 * text-X): nunca colores crudos, y se adapta solo a claro/oscuro.
 */
const STATUS_CARD_CLASSES: Record<AppointmentStatus, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  confirmed: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-success/30 bg-success/10 text-success",
  cancelled: "border-destructive/25 bg-destructive/8 text-destructive",
  no_show: "border-border bg-muted text-muted-foreground",
};

function minutesToLabel(min: number): string {
  const hours = Math.floor(min / 60);
  const mins = min % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function DayGrid({
  appointments,
  professionals,
  timezone,
  isLoading,
  isError,
  overdueByCustomer,
  onSelectAppointment,
  onSelectSlot,
}: DayGridProps): React.ReactElement {
  const [nowMin, setNowMin] = useState<number>(() =>
    agendaLocalMinutes(new Date().toISOString(), timezone),
  );

  // Reloj de la línea de "ahora": se recalcula al montar/cambiar de zona y cada minuto.
  useEffect(() => {
    setNowMin(agendaLocalMinutes(new Date().toISOString(), timezone));
    const id = window.setInterval(() => {
      setNowMin(agendaLocalMinutes(new Date().toISOString(), timezone));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);

  const positioned = useMemo<PositionedAppointment[]>(
    () =>
      appointments.map((appointment) => {
        const startMin = agendaLocalMinutes(appointment.starts_at, timezone);
        const durationMin =
          appointment.service?.duration_minutes ??
          Math.round(
            (Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60000,
          );
        return { appointment, startMin, durationMin };
      }),
    [appointments, timezone],
  );

  const timelineItems = useMemo<TimelineItem[]>(
    () =>
      positioned.map((item) => ({
        startMin: item.startMin,
        durationMin: item.durationMin,
        needsExtra: Boolean(item.appointment.notes),
      })),
    [positioned],
  );

  const dayWindow = useMemo(
    () => computeDayWindow([], timelineItems, FALLBACK_WINDOW),
    [timelineItems],
  );

  const timeline = useMemo(
    () =>
      buildDayTimeline(timelineItems, {
        dayStartMin: dayWindow.dayStartMin,
        dayEndMin: dayWindow.dayEndMin,
        base: TIMELINE_BASE,
        minCard: TIMELINE_MIN_CARD,
        extra: TIMELINE_EXTRA,
      }),
    [timelineItems, dayWindow],
  );

  const byProfessional = useMemo(() => {
    const map = new Map<string, PositionedAppointment[]>();
    for (const item of positioned) {
      const existing = map.get(item.appointment.professional_id);
      if (existing) {
        existing.push(item);
      } else {
        map.set(item.appointment.professional_id, [item]);
      }
    }
    return map;
  }, [positioned]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    const first = Math.ceil(dayWindow.dayStartMin / 60) * 60;
    for (let t = first; t <= dayWindow.dayEndMin; t += 60) marks.push(t);
    return marks;
  }, [dayWindow]);

  if (isLoading) {
    return <DayGridSkeleton columns={Math.max(professionals.length, 3)} />;
  }
  if (isError) {
    return <DayGridError />;
  }
  if (professionals.length === 0) {
    return <DayGridNoProfessionals />;
  }

  const gridTemplateColumns = `${GUTTER_WIDTH}px repeat(${professionals.length}, minmax(148px, 1fr))`;
  const showNowLine = nowMin >= dayWindow.dayStartMin && nowMin <= dayWindow.dayEndMin;

  return (
    // Sin padding-top aquí a propósito: el gap visual bajo la cabecera se
    // consigue con el margin-top del wrapper de abajo, no con padding en el
    // contenedor con scroll (si no, la cabecera sticky deja un "bleed").
    <div className="max-h-[calc(100vh_-_280px)] overflow-auto">
      <div className="mb-4 mt-3 min-w-[640px] rounded-xl border border-border bg-card shadow-sm">
        <div
          className="sticky top-0 z-20 grid rounded-t-xl border-b border-border bg-card shadow-md"
          style={{ gridTemplateColumns }}
        >
          <div aria-hidden="true" />
          {professionals.map((professional) => {
            const count = (byProfessional.get(professional.id) ?? []).filter(
              (item) => item.appointment.status !== "cancelled",
            ).length;
            return (
              <div
                key={professional.id}
                className="flex items-center gap-2 border-r border-border px-3 py-2.5 last:border-r-0"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: professional.color ?? "hsl(var(--muted-foreground))" }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-card-foreground">
                    {professional.full_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {count} {count === 1 ? "cita" : "citas"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative z-0 grid" style={{ gridTemplateColumns, height: timeline.total }}>
          <div className="relative" style={{ height: timeline.total }}>
            {hourMarks.map((min) => (
              <div
                key={min}
                className="pointer-events-none absolute right-2 -translate-y-1/2 bg-card px-1 text-[11px] font-medium text-muted-foreground"
                style={{ top: timeline.yAt(min) }}
              >
                {minutesToLabel(min)}
              </div>
            ))}
          </div>

          {professionals.map((professional) => (
            <ProfessionalColumn
              key={professional.id}
              professional={professional}
              items={byProfessional.get(professional.id) ?? []}
              timeline={timeline}
              timezone={timezone}
              hourMarks={hourMarks}
              closedRanges={dayWindow.closed}
              overdueByCustomer={overdueByCustomer}
              onSelectAppointment={onSelectAppointment}
              onSelectSlot={onSelectSlot}
            />
          ))}

          {showNowLine ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 z-10 h-0.5 bg-destructive"
              style={{ top: timeline.yAt(nowMin), left: GUTTER_WIDTH }}
            >
              <span className="absolute -left-[5px] -top-[4px] h-2.5 w-2.5 rounded-full bg-destructive" />
            </div>
          ) : null}

          {appointments.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
              <CalendarDays className="h-6 w-6 text-muted-foreground/70" aria-hidden="true" />
              <p className="text-sm font-medium text-muted-foreground">Sin citas para este día</p>
              <p className="max-w-[240px] text-xs text-muted-foreground/80">
                Haz clic en un hueco libre para crear la primera cita.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DayGridSkeleton({ columns }: { columns: number }): React.ReactElement {
  const cardHeights = [88, 132, 96, 116];
  const gridTemplateColumns = `${GUTTER_WIDTH}px repeat(${columns}, minmax(148px, 1fr))`;

  return (
    <div className="max-h-[calc(100vh_-_280px)] overflow-hidden">
      <div className="mb-4 mt-3 min-w-[640px] rounded-xl border border-border bg-card shadow-sm">
        <div className="grid rounded-t-xl border-b border-border" style={{ gridTemplateColumns }}>
          <div aria-hidden="true" />
          {Array.from({ length: columns }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-2 border-r border-border px-3 py-3 last:border-r-0"
            >
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns }}>
          <div aria-hidden="true" />
          {Array.from({ length: columns }, (_, colIndex) => (
            <div
              key={colIndex}
              className="flex flex-col gap-3 border-r border-border p-3 last:border-r-0"
            >
              {cardHeights.map((cardHeight, rowIndex) => (
                <Skeleton
                  key={rowIndex}
                  className="w-full shrink-0 rounded-lg"
                  style={{ height: cardHeight }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayGridError(): React.ReactElement {
  return (
    <div className="mb-4 mt-3 flex min-h-[320px] min-w-[640px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="font-semibold text-foreground">No se han podido cargar las citas del día</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ha ocurrido un problema al conectar con el servidor. Vuelve a intentarlo en unos segundos.
      </p>
    </div>
  );
}

function DayGridNoProfessionals(): React.ReactElement {
  return (
    <div className="mb-4 mt-3 flex min-h-[320px] min-w-[640px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
      <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="font-semibold text-foreground">No hay profesionales activos</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Añade profesionales en Ajustes para empezar a gestionar la agenda del día.
      </p>
    </div>
  );
}

interface ProfessionalColumnProps {
  professional: DayGridProfessional;
  items: PositionedAppointment[];
  timeline: DayTimeline;
  timezone: string;
  hourMarks: number[];
  closedRanges: OpeningRange[];
  overdueByCustomer?: Record<string, number>;
  onSelectAppointment: (appointment: AppointmentWithDetails) => void;
  onSelectSlot: (professionalId: string, startMin: number) => void;
}

function ProfessionalColumn({
  professional,
  items,
  timeline,
  timezone,
  hourMarks,
  closedRanges,
  overdueByCustomer,
  onSelectAppointment,
  onSelectSlot,
}: ProfessionalColumnProps): React.ReactElement {
  return (
    <div
      className="relative cursor-pointer border-r border-border transition-colors hover:bg-muted/30 last:border-r-0"
      style={{ height: timeline.total }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const y = event.clientY - rect.top;
        onSelectSlot(professional.id, snapMinutes(timeline.minAt(y), SLOT_SNAP_MIN));
      }}
    >
      {hourMarks.map((min) => (
        <div
          key={min}
          className="pointer-events-none absolute inset-x-0 border-t border-border"
          style={{ top: timeline.yAt(min) }}
        />
      ))}

      {closedRanges.map((range) => {
        const bandTop = timeline.yAt(range.startMin);
        const bandHeight = timeline.yAt(range.endMin) - bandTop;
        return (
          <div
            key={`${range.startMin}-${range.endMin}`}
            className="pointer-events-none absolute inset-x-0 z-[1] flex items-center justify-center"
            style={{
              top: bandTop,
              height: bandHeight,
              background:
                "repeating-linear-gradient(135deg, hsl(var(--muted)), hsl(var(--muted)) 8px, transparent 8px, transparent 16px)",
            }}
          >
            <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Cerrado
            </span>
          </div>
        );
      })}

      {items.map(({ appointment, startMin, durationMin }) => {
        const cardTop = timeline.yAt(startMin);
        const cardBottom = timeline.yAt(startMin + durationMin);
        const cardHeight = Math.max(cardBottom - cardTop - 4, 32);
        const overdueCount = overdueByCustomer?.[appointment.customer_id] ?? 0;
        return (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            professionalColor={professional.color}
            timezone={timezone}
            top={cardTop}
            height={cardHeight}
            overdueCount={overdueCount}
            onSelect={onSelectAppointment}
          />
        );
      })}
    </div>
  );
}

interface AppointmentCardProps {
  appointment: AppointmentWithDetails;
  professionalColor: string | null;
  timezone: string;
  top: number;
  height: number;
  overdueCount: number;
  onSelect: (appointment: AppointmentWithDetails) => void;
}

function AppointmentCard({
  appointment,
  professionalColor,
  timezone,
  top,
  height,
  overdueCount,
  onSelect,
}: AppointmentCardProps): React.ReactElement {
  const isCancelled = appointment.status === "cancelled";
  const startLabel = formatSlotTime(appointment.starts_at, timezone);
  const endLabel = formatSlotTime(appointment.ends_at, timezone);
  const serviceLabel =
    appointment.service !== null
      ? `${appointment.service.name} · ${formatPrice(appointment.price_cents, appointment.currency)}`
      : formatPrice(appointment.price_cents, appointment.currency);
  const hasNote = Boolean(appointment.notes);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(appointment);
      }}
      className={cn(
        "absolute inset-x-1.5 z-[3] flex flex-col overflow-hidden rounded-lg border py-1.5 pl-3 pr-2 text-left shadow-xs transition-shadow duration-150 hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        STATUS_CARD_CLASSES[appointment.status],
        isCancelled && "line-through",
      )}
      style={{ top, height }}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: professionalColor ?? "hsl(var(--muted-foreground))" }}
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[11px] font-semibold tabular-nums opacity-85">
          {startLabel}–{endLabel}
        </span>
        <AppointmentStatusBadge
          status={appointment.status}
          className="gap-1 px-1.5 py-0 text-[10px] leading-[16px]"
        />
      </div>
      <span className="truncate text-[13px] font-semibold leading-tight">
        {appointment.customer?.full_name ?? "Cliente"}
      </span>
      <span className="truncate text-[11.5px] leading-tight opacity-80">{serviceLabel}</span>
      {overdueCount > 0 ? (
        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-destructive">
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {overdueCount} {overdueCount === 1 ? "vencida" : "vencidas"}
        </span>
      ) : null}
      {hasNote ? (
        <span className="mt-1 flex items-start gap-1 text-[11px] leading-snug opacity-90">
          <StickyNote className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden="true" />
          <span className="line-clamp-2">{appointment.notes}</span>
        </span>
      ) : null}
    </button>
  );
}
