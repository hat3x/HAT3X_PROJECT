"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
 *
 * Fase 4 — arrastrar y redimensionar: las tarjetas `pending`/`confirmed`
 * aceptan un gesto de puntero (mover el cuerpo, o redimensionar desde el
 * grip inferior) que snapea a 5 min contra el mismo eje elástico y permite
 * cruzar de columna (profesional). Sigue siendo "tonto": solo reporta el
 * gesto vía `onMoveAppointment`; quien lo reciba decide si lo persiste. Sin
 * ese callback, las tarjetas no son arrastrables (fallback: solo click).
 */

interface DayGridProfessional {
  id: string;
  full_name: string;
  color: string | null;
}

/** Gesto de arrastre soportado por una tarjeta: mover el cuerpo o redimensionar desde el grip inferior. */
type AppointmentDragMode = "move" | "resize";

/** Resultado de un gesto de arrastre/redimensión, ya snapeado a 5 min y acotado a la ventana del día. */
interface AppointmentDragCommit {
  startMin: number;
  durationMin: number;
  professionalId: string;
}

interface DayGridProps {
  appointments: AppointmentWithDetails[];
  professionals: DayGridProfessional[];
  timezone: string;
  /** Rangos de apertura de la clínica para el día (para pintar las franjas "Cerrado"). */
  openingRanges?: OpeningRange[];
  /** Si es `false`, oculta la línea de "ahora" (se usa al ver días distintos a hoy). Por defecto `true`. */
  isToday?: boolean;
  isLoading: boolean;
  isError: boolean;
  overdueByCustomer?: Record<string, number>;
  onSelectAppointment: (appointment: AppointmentWithDetails) => void;
  onSelectSlot: (professionalId: string, startMin: number) => void;
  /**
   * Fase 4 — reporta el resultado de un gesto de arrastre/redimensión (mover
   * o cambiar de duración). El componente no persiste nada: solo emite el
   * gesto ya snapeado/acotado y delega la decisión al padre. Si se omite,
   * las tarjetas no son arrastrables (fallback: solo click, como hoy).
   */
  onMoveAppointment?: (appointment: AppointmentWithDetails, next: AppointmentDragCommit) => void;
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
/** Parámetros del eje elástico — idénticos a los del mockup aprobado.
 * `TIMELINE_BASE` se usa como FALLBACK del `base` dinámico mientras no se ha
 * medido aún el contenedor con scroll (ver `viewportHeight` más abajo). */
const TIMELINE_BASE = 1.35;
const TIMELINE_MIN_CARD = 58;
const TIMELINE_EXTRA = 26;
/** Suelo legible del `base` DINÁMICO: nunca se comprime por debajo de esto
 * (~66px/hora) aunque el viewport sea muy bajo — el estirado elástico de
 * `buildDayTimeline` sigue ganando para las tarjetas cortas por encima de esto. */
const MIN_PX_PER_MIN = 1.1;
/** Alto aprox. de la cabecera sticky (fila de profesionales) — para calcular
 * cuánto alto queda disponible para el eje de tiempo al medir el contenedor. */
const DAY_HEADER_PX = 52;
/** Aire entre la cabecera y el borde inferior del contenedor con scroll. */
const VIEWPORT_BREATHING_ROOM_PX = 12;
/** Aire ENTRE la cabecera sticky y la primera línea de hora, para que las
 * 10:00 (línea + etiqueta) no queden pegadas a los nombres. Se descuenta del
 * alto disponible al calcular la escala para no generar scroll fantasma. */
const TIMELINE_TOP_PAD_PX = 16;
/** Snap al pulsar un hueco vacío, y también al arrastrar/redimensionar citas (minutos). */
const SLOT_SNAP_MIN = 5;
/** Umbral de movimiento (px) antes de considerar un puntero-abajo un arrastre real y no un click. */
const DRAG_MOVE_THRESHOLD_PX = 3;
/** Guarda de borde (px): si una etiqueta de hora cae a menos de esto del
 * borde superior/inferior del cuerpo, se ancla hacia dentro en vez de
 * centrarse en la línea — evita que quede tapada por la cabecera sticky (la
 * primera) o que se salga del cuerpo (la última). */
const LABEL_EDGE_GUARD_PX = 8;

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

interface AppointmentDragState {
  appointment: AppointmentWithDetails;
  mode: AppointmentDragMode;
  originProfessionalId: string;
  origStartMin: number;
  origDurationMin: number;
  liveStartMin: number;
  liveDurationMin: number;
  liveProfessionalId: string;
  translateX: number;
}

interface AppointmentDragTooltip {
  x: number;
  y: number;
  label: string;
}

interface BeginDragParams {
  appointment: AppointmentWithDetails;
  mode: AppointmentDragMode;
  professionalId: string;
  startMin: number;
  durationMin: number;
}

interface UseAppointmentDragOptions {
  timeline: DayTimeline;
  dayStartMin: number;
  dayEndMin: number;
  professionals: DayGridProfessional[];
  onMoveAppointment?: (appointment: AppointmentWithDetails, next: AppointmentDragCommit) => void;
}

interface UseAppointmentDragResult {
  dragState: AppointmentDragState | null;
  tooltip: AppointmentDragTooltip | null;
  beginDrag: (event: ReactPointerEvent<HTMLButtonElement>, params: BeginDragParams) => void;
  /** Lee (y limpia) si el último gesto fue un arrastre real, para que el `onClick` nativo lo ignore. */
  consumeSuppressedClick: () => boolean;
}

/**
 * Gestiona el gesto de arrastrar/redimensionar citas con Pointer Events.
 * Vive fuera de `DayGrid` para no saturar el componente: no conoce el
 * layout, solo minutos, píxeles (vía `timeline`) y elementos marcados con
 * `[data-professional-id]`. El movimiento/soltura se escucha en `window`
 * (más robusto que depender solo del elemento capturado — p. ej. si el
 * puntero sale del documento) y las actualizaciones en vuelo se acumulan en
 * un ref, volcándose a estado de React como mucho una vez por frame (rAF)
 * para no saturar el render con ratones de alta frecuencia de sondeo.
 */
function useAppointmentDrag({
  timeline,
  dayStartMin,
  dayEndMin,
  professionals,
  onMoveAppointment,
}: UseAppointmentDragOptions): UseAppointmentDragResult {
  const [dragState, setDragState] = useState<AppointmentDragState | null>(null);
  const [tooltip, setTooltip] = useState<AppointmentDragTooltip | null>(null);

  const stateRef = useRef<AppointmentDragState | null>(null);
  const movedRef = useRef(false);
  const tooltipRef = useRef<AppointmentDragTooltip | null>(null);
  const rafRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const originColumnLeftRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Si el componente se desmonta a media faena (p. ej. cambio de día durante
  // el arrastre), retira los listeners de `window` para no dejarlos huérfanos.
  useEffect(() => () => cleanupRef.current?.(), []);

  function flush(): void {
    rafRef.current = null;
    setDragState(stateRef.current);
    setTooltip(tooltipRef.current);
  }

  function scheduleFlush(): void {
    if (rafRef.current === null) {
      rafRef.current = window.requestAnimationFrame(flush);
    }
  }

  function endDrag(commit: boolean): void {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    document.body.style.userSelect = "";
    const finalState = stateRef.current;
    const moved = movedRef.current;
    stateRef.current = null;
    tooltipRef.current = null;
    movedRef.current = false;
    setDragState(null);
    setTooltip(null);
    if (commit && finalState && moved) {
      suppressClickRef.current = true;
      onMoveAppointment?.(finalState.appointment, {
        startMin: finalState.liveStartMin,
        durationMin: finalState.liveDurationMin,
        professionalId: finalState.liveProfessionalId,
      });
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, params: BeginDragParams): void {
    if (event.button !== 0 || stateRef.current) return;
    const { appointment, mode, professionalId, startMin, durationMin } = params;

    const originColumn = event.currentTarget.closest<HTMLElement>("[data-professional-id]");
    originColumnLeftRef.current = originColumn ? originColumn.getBoundingClientRect().left : null;

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const originY = timeline.yAt(startMin);

    const initial: AppointmentDragState = {
      appointment,
      mode,
      originProfessionalId: professionalId,
      origStartMin: startMin,
      origDurationMin: durationMin,
      liveStartMin: startMin,
      liveDurationMin: durationMin,
      liveProfessionalId: professionalId,
      translateX: 0,
    };
    stateRef.current = initial;
    movedRef.current = false;
    setDragState(initial);
    document.body.style.userSelect = "none";

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    // jsdom (entorno de test) no implementa la captura de puntero — se
    // comprueba el método antes de llamarlo (mismo motivo que table-node.tsx).
    if (typeof target.setPointerCapture === "function") {
      target.setPointerCapture(pointerId);
    }

    function handleMove(moveEvent: PointerEvent): void {
      const current = stateRef.current;
      if (!current) return;
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;
      if (Math.abs(dx) > DRAG_MOVE_THRESHOLD_PX || Math.abs(dy) > DRAG_MOVE_THRESHOLD_PX) {
        movedRef.current = true;
      }

      let next: AppointmentDragState;
      if (current.mode === "resize") {
        const rawEndMin = timeline.minAt(
          timeline.yAt(current.origStartMin + current.origDurationMin) + dy,
        );
        const snappedEnd = snapMinutes(rawEndMin, SLOT_SNAP_MIN);
        const clampedEnd = Math.max(
          current.origStartMin + SLOT_SNAP_MIN,
          Math.min(dayEndMin, snappedEnd),
        );
        next = {
          ...current,
          liveStartMin: current.origStartMin,
          liveDurationMin: clampedEnd - current.origStartMin,
          liveProfessionalId: current.originProfessionalId,
          translateX: 0,
        };
      } else {
        const rawStartMin = timeline.minAt(originY + dy);
        const snappedStart = snapMinutes(rawStartMin, SLOT_SNAP_MIN);
        const clampedStart = Math.max(
          dayStartMin,
          Math.min(dayEndMin - current.origDurationMin, snappedStart),
        );
        const targetColumn = document
          .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
          ?.closest<HTMLElement>("[data-professional-id]");
        const targetProfessionalId =
          targetColumn?.getAttribute("data-professional-id") ?? current.liveProfessionalId;
        const originLeft = originColumnLeftRef.current;
        const translateX =
          targetColumn && originLeft !== null
            ? targetColumn.getBoundingClientRect().left - originLeft
            : 0;
        next = {
          ...current,
          liveStartMin: clampedStart,
          liveDurationMin: current.origDurationMin,
          liveProfessionalId: targetProfessionalId,
          translateX,
        };
      }
      stateRef.current = next;

      const label =
        next.mode === "resize"
          ? `${next.liveDurationMin} min`
          : `${minutesToLabel(next.liveStartMin)}–${minutesToLabel(next.liveStartMin + next.liveDurationMin)}`;
      const professionalName =
        next.mode === "move" && next.liveProfessionalId !== next.originProfessionalId
          ? professionals.find((professional) => professional.id === next.liveProfessionalId)
              ?.full_name
          : undefined;
      tooltipRef.current = {
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        label: professionalName ? `${label} · ${professionalName}` : label,
      };
      scheduleFlush();
    }

    function handleUp(): void {
      endDrag(true);
    }

    function handleCancel(): void {
      endDrag(false);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      try {
        if (typeof target.releasePointerCapture === "function") {
          target.releasePointerCapture(pointerId);
        }
      } catch {
        // El navegador ya pudo liberar la captura implícitamente al recibir
        // pointerup/pointercancel; liberar una captura ya perdida no es un error real.
      }
    };
  }

  function consumeSuppressedClick(): boolean {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }

  return { dragState, tooltip, beginDrag, consumeSuppressedClick };
}

export function DayGrid({
  appointments,
  professionals,
  timezone,
  openingRanges,
  isToday,
  isLoading,
  isError,
  overdueByCustomer,
  onSelectAppointment,
  onSelectSlot,
  onMoveAppointment,
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

  // Alto real (px) del contenedor con scroll — con esto el eje elástico se
  // adapta a la pantalla en vez de usar un `TIMELINE_BASE` fijo (ver
  // `pxPerMinBase` más abajo). 0 hasta el primer `ResizeObserver`
  // (SSR/primer pintado), momento en el que se usa el fallback fijo — nunca
  // hay una rejilla a 0px. Los deps de loading/error/sin-profesionales hacen
  // que el efecto se reintente cuando esos estados dejan paso a la rejilla
  // real: en el primer render (loading) el contenedor con `ref` aún no existe.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isLoading, isError, professionals.length]);

  const positioned = useMemo<PositionedAppointment[]>(
    () =>
      appointments.map((appointment) => {
        const startMin = agendaLocalMinutes(appointment.starts_at, timezone);
        // La tarjeta ocupa lo que dura la cita DE VERDAD (starts_at → ends_at),
        // no la duración por defecto del servicio: una cita movida/acortada debe
        // reflejar su hueco real, coherente con el texto de horas que ya muestra.
        const durationMin = Math.max(
          1,
          Math.round(
            (Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60000,
          ),
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
    () => computeDayWindow(openingRanges ?? [], timelineItems, FALLBACK_WINDOW),
    [openingRanges, timelineItems],
  );

  // `base` DINÁMICO del eje elástico: hasta medir el contenedor, el
  // `TIMELINE_BASE` fijo de siempre; después, el que hace que la ventana del
  // día llene el alto disponible (cabecera + aire descontados), sin bajar
  // del suelo legible. El estirado elástico de `buildDayTimeline` (minCard/
  // extra, sin tocar) sigue ganando para las tarjetas cortas por encima de este `base`.
  const pxPerMinBase = useMemo(() => {
    if (viewportHeight <= 0) return TIMELINE_BASE;
    const windowMinutes = dayWindow.dayEndMin - dayWindow.dayStartMin;
    const available = Math.max(
      viewportHeight - DAY_HEADER_PX - VIEWPORT_BREATHING_ROOM_PX - TIMELINE_TOP_PAD_PX,
      0,
    );
    return windowMinutes > 0 ? Math.max(MIN_PX_PER_MIN, available / windowMinutes) : MIN_PX_PER_MIN;
  }, [viewportHeight, dayWindow]);

  const timeline = useMemo(
    () =>
      buildDayTimeline(timelineItems, {
        dayStartMin: dayWindow.dayStartMin,
        dayEndMin: dayWindow.dayEndMin,
        base: pxPerMinBase,
        minCard: TIMELINE_MIN_CARD,
        extra: TIMELINE_EXTRA,
      }),
    [timelineItems, dayWindow, pxPerMinBase],
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

  // Fase 4: hook de arrastre/redimensión. Se llama SIEMPRE (antes de los
  // `return` condicionales de abajo) para respetar las reglas de hooks —
  // aunque no haya nada que arrastrar todavía (loading/error/sin citas).
  const drag = useAppointmentDrag({
    timeline,
    dayStartMin: dayWindow.dayStartMin,
    dayEndMin: dayWindow.dayEndMin,
    professionals,
    onMoveAppointment,
  });
  const canDrag = onMoveAppointment !== undefined;

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
  const showNowLine =
    (isToday ?? true) && nowMin >= dayWindow.dayStartMin && nowMin <= dayWindow.dayEndMin;

  return (
    <>
      {/* Sin padding-top aquí a propósito: el gap visual bajo la cabecera se
      consigue con el margin-top del wrapper de abajo, no con padding en el
      contenedor con scroll (si no, la cabecera sticky deja un "bleed"). */}
      <div ref={scrollRef} className="h-full overflow-auto">
      <div className="mb-4 mt-3 rounded-xl border border-border bg-[var(--glass-bg-dense)] shadow-sm backdrop-blur-xl">
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

        <div
          className="relative z-0 grid"
          style={{ gridTemplateColumns, height: timeline.total, marginTop: TIMELINE_TOP_PAD_PX }}
        >
          <div className="relative" style={{ height: timeline.total }}>
            {hourMarks.map((min) => {
              const y = timeline.yAt(min);
              // Ancla la etiqueta hacia DENTRO del cuerpo cerca de los
              // bordes: centrada (-50%) en el caso normal, pero la primera
              // (si cae junto a y=0) no debe asomar por encima —quedaría
              // tapada por la cabecera sticky (z-20, opaca)— y la última
              // (si cae junto al final) no debe salirse por debajo del
              // cuerpo. La LÍNEA de hora (en cada columna) no se toca: solo
              // cambia el punto de anclaje del texto, así siguen alineadas.
              const nearTop = y <= LABEL_EDGE_GUARD_PX;
              const nearBottom = y >= timeline.total - LABEL_EDGE_GUARD_PX;
              const translateY = nearTop ? "0" : nearBottom ? "-100%" : "-50%";
              return (
                <div
                  key={min}
                  className="pointer-events-none absolute right-2 bg-card px-1 text-[11px] font-medium text-muted-foreground"
                  style={{ top: y, transform: `translateY(${translateY})` }}
                >
                  {minutesToLabel(min)}
                </div>
              );
            })}
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
              drag={drag}
              canDrag={canDrag}
            />
          ))}

          {showNowLine ? (
            <div
              className="pointer-events-none absolute right-0 z-10 h-0.5 bg-destructive"
              style={{ top: timeline.yAt(nowMin), left: GUTTER_WIDTH }}
            >
              <span className="absolute -left-[5px] -top-[4px] h-2.5 w-2.5 rounded-full bg-destructive" />
              <span className="absolute -top-2.5 left-1 rounded-full bg-destructive px-1.5 py-px text-[10px] font-semibold leading-none text-destructive-foreground">
                ahora
              </span>
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

      {drag.tooltip ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold tabular-nums text-background shadow-lg"
          style={{ left: drag.tooltip.x + 16, top: drag.tooltip.y - 34 }}
        >
          {drag.tooltip.label}
        </div>
      ) : null}
    </>
  );
}

function DayGridSkeleton({ columns }: { columns: number }): React.ReactElement {
  const cardHeights = [88, 132, 96, 116];
  const gridTemplateColumns = `${GUTTER_WIDTH}px repeat(${columns}, minmax(148px, 1fr))`;

  return (
    <div className="h-full overflow-hidden">
      <div className="mb-4 mt-3 rounded-xl border border-border bg-[var(--glass-bg-dense)] shadow-sm backdrop-blur-xl">
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
    <div className="mb-4 mt-3 flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-[var(--glass-bg-dense)] p-8 text-center shadow-sm backdrop-blur-xl">
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
    <div className="mb-4 mt-3 flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-[var(--glass-bg-dense)] p-8 text-center shadow-sm backdrop-blur-xl">
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
  /** Fase 4: estado/handlers de arrastre compartidos por toda la parrilla (una sola instancia por `DayGrid`). */
  drag: UseAppointmentDragResult;
  /** `true` si el padre pasó `onMoveAppointment` — controla si esta columna ofrece tarjetas arrastrables. */
  canDrag: boolean;
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
  drag,
  canDrag,
}: ProfessionalColumnProps): React.ReactElement {
  return (
    <div
      data-professional-id={professional.id}
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
        // Si ESTA tarjeta es la que se está arrastrando, sus coordenadas en
        // vivo (`activeDrag`) pisan a las de los datos hasta que se suelte.
        const currentDragState = drag.dragState;
        const activeDrag =
          currentDragState && currentDragState.appointment.id === appointment.id
            ? currentDragState
            : null;
        const liveStartMin = activeDrag?.liveStartMin ?? startMin;
        const liveDurationMin = activeDrag?.liveDurationMin ?? durationMin;
        const cardTop = timeline.yAt(liveStartMin);
        const cardBottom = timeline.yAt(liveStartMin + liveDurationMin);
        const cardHeight = Math.max(cardBottom - cardTop - 4, 32);
        const overdueCount = overdueByCustomer?.[appointment.customer_id] ?? 0;
        const draggable =
          canDrag && (appointment.status === "pending" || appointment.status === "confirmed");
        return (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            professionalColor={professional.color}
            timezone={timezone}
            top={cardTop}
            height={cardHeight}
            translateX={activeDrag?.translateX ?? 0}
            overdueCount={overdueCount}
            draggable={draggable}
            isDragging={activeDrag !== null}
            onSelect={onSelectAppointment}
            consumeSuppressedClick={drag.consumeSuppressedClick}
            onDragPointerDown={
              draggable
                ? (event, mode) =>
                    drag.beginDrag(event, {
                      appointment,
                      mode,
                      professionalId: professional.id,
                      startMin,
                      durationMin,
                    })
                : undefined
            }
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
  /** Desplazamiento horizontal en vivo (px) mientras se arrastra a otra columna/profesional. */
  translateX: number;
  overdueCount: number;
  /** `pending`/`confirmed` + el padre pasó `onMoveAppointment` (Fase 4). */
  draggable: boolean;
  /** Esta tarjeta concreta es la que se está arrastrando ahora mismo. */
  isDragging: boolean;
  onSelect: (appointment: AppointmentWithDetails) => void;
  /** Ausente cuando `draggable` es `false` — sin él, la tarjeta es solo-click (como antes de Fase 4). */
  onDragPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>, mode: AppointmentDragMode) => void;
  consumeSuppressedClick: () => boolean;
}

function AppointmentCard({
  appointment,
  professionalColor,
  timezone,
  top,
  height,
  translateX,
  overdueCount,
  draggable,
  isDragging,
  onSelect,
  onDragPointerDown,
  consumeSuppressedClick,
}: AppointmentCardProps): React.ReactElement {
  const isCancelled = appointment.status === "cancelled";
  const startLabel = formatSlotTime(appointment.starts_at, timezone);
  const endLabel = formatSlotTime(appointment.ends_at, timezone);
  const serviceLabel =
    appointment.service !== null
      ? `${appointment.service.name} · ${formatPrice(appointment.price_cents, appointment.currency)}`
      : formatPrice(appointment.price_cents, appointment.currency);
  const hasNote = Boolean(appointment.notes);

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!onDragPointerDown) return;
    const isGrip = event.target instanceof Element && event.target.closest("[data-grip]") !== null;
    onDragPointerDown(event, isGrip ? "resize" : "move");
  }

  return (
    <button
      type="button"
      onPointerDown={draggable ? handlePointerDown : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (consumeSuppressedClick()) return;
        onSelect(appointment);
      }}
      className={cn(
        "absolute inset-x-1.5 z-[3] flex flex-col overflow-hidden rounded-lg border py-1.5 pl-3 pr-2 text-left shadow-xs transition-shadow duration-150 hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        STATUS_CARD_CLASSES[appointment.status],
        isCancelled && "line-through",
        draggable ? "group cursor-grab touch-none select-none" : "cursor-default",
        isDragging && "z-30 cursor-grabbing shadow-md transition-none",
      )}
      style={{
        top,
        height,
        transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
      }}
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
      {draggable ? (
        <span
          data-grip=""
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center opacity-0 group-hover:opacity-100"
        >
          <span className="h-[3px] w-6 rounded-full bg-current opacity-60" />
        </span>
      ) : null}
    </button>
  );
}
