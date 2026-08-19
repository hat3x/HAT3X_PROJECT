"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, CalendarDays } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useAppointmentsRange } from "@/hooks/use-appointments";
import { useSalonSchedule } from "@/hooks/use-schedules";
import { agendaLocalMinutes } from "@/lib/agenda/day-model";
import { layoutLanes } from "@/lib/agenda/lanes";
import { buildDayTimeline, snapMinutes } from "@/lib/agenda/timeline";
import { formatSlotTime } from "@/lib/booking/format";
import { localDateInZone, weekdayOfLocalDate } from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";
import type { OpeningRange } from "@/lib/agenda/day-model";
import type { DayTimeline, TimelineItem } from "@/lib/agenda/timeline";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { AppointmentStatus } from "@/types/database";

/**
 * WeekGrid — parrilla horaria de la semana (7 columnas de día × eje de horas).
 *
 * Porta la vista "Semana" del mockup aprobado
 * (docs/superpowers/reference/2026-08-12-agenda-mockup.html) a Tailwind +
 * tokens de Kairos, con dos mejoras clave sobre el mockup para que las
 * tarjetas NO se corten nunca con datos reales (donde una columna de día
 * mezcla a TODOS los profesionales):
 *
 *  1. **Eje ELÁSTICO compartido** (`buildDayTimeline`, el mismo que la vista
 *     Día): la franja horaria se estira lo justo para que ninguna tarjeta
 *     quede por debajo de su altura mínima legible (hora + nombre). El eje se
 *     construye con las citas de TODA la semana, así las horas siguen
 *     alineadas entre las 7 columnas. `base` se adapta al alto real (llena la
 *     pantalla cuando el día es corto; hace scroll cuando no cabe).
 *  2. **Carriles por día** (`layoutLanes`): las citas que se solapan (p. ej.
 *     dos profesionales a la misma hora) se reparten lado a lado en vez de
 *     pisarse — cada una ocupa `1/lanes` del ancho de la columna.
 *
 * Reutiliza de `day-grid.tsx`: la cabecera STICKY + OPACA con z-index alto, el
 * cuerpo con su propio contexto de apilado (z-index 0), el truco de NO
 * padding-top en el contenedor con scroll (usa margin-top en su lugar), el
 * eje elástico y el mismo tinte por estado (`STATUS_CARD_CLASSES`).
 *
 * A diferencia de `DayGrid` (puramente presentacional), este componente SÍ
 * llama a sus propios hooks de datos (`useAppointmentsRange`,
 * `useSalonSchedule`) — ambos "use client" sobre `@/lib/supabase/client`, así
 * que no cruza el límite RSC (nunca importa de `@/lib/salon`).
 *
 * Arrastre (mover, sin redimensionar): vertical cambia la hora (snap 5 min
 * contra el eje elástico, acotado a la ventana), horizontal cruza de
 * columna/día (columna bajo el puntero vía `data-week-date` +
 * `document.elementFromPoint`). Solo tarjetas `pending`/`confirmed`, y solo si
 * el padre pasa `onMoveAppointment`.
 */

interface WeekGridProfessional {
  id: string;
  full_name: string;
  color: string | null;
}

interface WeekGridProps {
  salonId: string;
  /** 7 fechas "YYYY-MM-DD", Lunes→Domingo. */
  weekDates: string[];
  timezone: string;
  /** Fecha "YYYY-MM-DD" de hoy — para la línea de "ahora" y el resalte de cabecera. */
  todayDate: string;
  /** Profesionales VISIBLES (ya filtrados por el padre) — las citas se filtran a estos. */
  professionals: WeekGridProfessional[];
  onSelectAppointment: (appointment: AppointmentWithDetails) => void;
  onSelectSlot: (date: string, startMin: number) => void;
  onMoveAppointment?: (
    appointment: AppointmentWithDetails,
    next: { date: string; startMin: number; durationMin: number },
  ) => void;
}

interface PositionedAppointment {
  appointment: AppointmentWithDetails;
  date: string;
  startMin: number;
  durationMin: number;
}

/** Ancho de la columna de horas (gutter), en píxeles — igual que DayGrid. */
const GUTTER_WIDTH = 56;
/** Parámetros del eje elástico de la Semana. Tarjetas compactas (solo hora +
 * nombre), así que `MIN_CARD` es menor que el de la vista Día. `TIMELINE_BASE`
 * es el fallback del `base` dinámico hasta medir el contenedor con scroll. */
const TIMELINE_BASE = 1.1;
const TIMELINE_MIN_CARD = 36;
/** Suelo del `base` DINÁMICO: nunca se comprime por debajo de esto aunque el
 * viewport sea muy bajo (el estirado elástico sigue ganando para las cortas). */
const MIN_PX_PER_MIN = 0.9;
/** Alto aprox. de la cabecera sticky (fila de días) — para calcular cuánto
 * alto queda disponible para el eje de tiempo al medir el contenedor. */
const WEEK_HEADER_PX = 44;
/** Aire entre la cabecera y el borde inferior del contenedor con scroll. */
const VIEWPORT_BREATHING_ROOM_PX = 12;
/** Aire ENTRE la cabecera sticky (días) y la primera línea de hora, para que
 * no quede pegada. Se descuenta del alto disponible al calcular la escala. */
const TIMELINE_TOP_PAD_PX = 16;
/** Ventana de fallback cuando no hay horario de apertura ni citas. */
const FALLBACK_WINDOW: OpeningRange = { startMin: 8 * 60, endMin: 21 * 60 };
/** Snap al pulsar un hueco vacío, y también al arrastrar citas (minutos). */
const SLOT_SNAP_MIN = 5;
/** Umbral de movimiento (px) antes de considerar un puntero-abajo un arrastre real y no un click. */
const DRAG_MOVE_THRESHOLD_PX = 3;
/** Guarda de borde (px): si una etiqueta de hora cae a menos de esto del
 * borde superior/inferior del cuerpo, se ancla hacia dentro en vez de
 * centrarse en la línea — evita que quede tapada por la cabecera sticky (la
 * primera) o que se salga del cuerpo (la última). */
const LABEL_EDGE_GUARD_PX = 8;
/** Hueco vertical (px) que se resta a la tarjeta para que no toque la siguiente. */
const CARD_GAP_PX = 2;
/** Hueco horizontal (px) entre carriles y en los bordes de cada columna. */
const LANE_GAP_PX = 3;

/** Mismo tinte por estado que `day-grid.tsx` (bg-X/10 + border-X/30 + text-X): nunca color crudo. */
const STATUS_CARD_CLASSES: Record<AppointmentStatus, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  confirmed: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-success/30 bg-success/10 text-success",
  cancelled: "border-destructive/25 bg-destructive/8 text-destructive",
  no_show: "border-border bg-muted text-muted-foreground",
};

/** Fecha local `YYYY-MM-DD` + delta de días → fecha local `YYYY-MM-DD`. */
function addLocalDays(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10);
}

/** "HH:MM" o "HH:MM:SS" (como lo guarda Postgres) → minutos desde medianoche. */
function toMinutes(time: string): number {
  const parts = time.split(":");
  const hours = Number(parts[0] ?? 0);
  const minutes = Number(parts[1] ?? 0);
  return hours * 60 + minutes;
}

function minutesToLabel(min: number): string {
  // Normaliza a [0, 1440) para que una cita que cruce medianoche no produzca
  // etiquetas inválidas ("24:00", "25:00") en las marcas de hora o el tooltip.
  const norm = ((Math.round(min) % 1440) + 1440) % 1440;
  const hours = Math.floor(norm / 60);
  const mins = norm % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Abreviatura del día de la semana en la zona del salón, p. ej. "mié.". Ancla
 * a mediodía UTC (mismo truco que `formatLongDate`) para que el desfase de
 * zona nunca cambie el día de calendario mostrado.
 */
function shortWeekdayLabel(date: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const instant = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("es-ES", { timeZone, weekday: "short" }).format(instant);
}

/**
 * Franjas "Cerrado" de un día dentro de la ventana visible: los huecos entre
 * los rangos de apertura de ESE día (p. ej. el descanso de mediodía), más lo
 * que quede de ventana antes del primer rango y después del último. Si el día
 * no tiene ningún rango de apertura (p. ej. domingo cerrado, o el horario aún
 * no ha cargado), toda la ventana se pinta como una única franja "Cerrado" —
 * a diferencia de `computeDayWindow` (Día), aquí SÍ importa distinguir un día
 * cerrado de un día con huecos, porque conviven 7 columnas a la vez.
 */
function closedBandsForDay(
  opens: readonly OpeningRange[],
  window: OpeningRange,
): OpeningRange[] {
  const sorted = [...opens].sort((a, b) => a.startMin - b.startMin);
  const bands: OpeningRange[] = [];
  let cursor = window.startMin;
  for (const range of sorted) {
    const start = Math.max(range.startMin, window.startMin);
    const end = Math.min(range.endMin, window.endMin);
    if (start > cursor) {
      bands.push({ startMin: cursor, endMin: start });
    }
    if (end > cursor) {
      cursor = end;
    }
  }
  if (cursor < window.endMin) {
    bands.push({ startMin: cursor, endMin: window.endMin });
  }
  return bands;
}

interface WeekDragState {
  appointment: AppointmentWithDetails;
  durationMin: number;
  liveDate: string;
  liveStartMin: number;
  /** Desplazamiento horizontal en vivo (px) mientras se arrastra a otra columna/día. */
  translateX: number;
}

interface WeekDragTooltip {
  x: number;
  y: number;
  label: string;
}

interface BeginWeekDragParams {
  appointment: AppointmentWithDetails;
  date: string;
  startMin: number;
  durationMin: number;
}

interface UseWeekAppointmentDragOptions {
  timeline: DayTimeline;
  windowStart: number;
  windowEnd: number;
  timezone: string;
  onMoveAppointment?: (
    appointment: AppointmentWithDetails,
    next: { date: string; startMin: number; durationMin: number },
  ) => void;
}

interface UseWeekAppointmentDragResult {
  dragState: WeekDragState | null;
  tooltip: WeekDragTooltip | null;
  beginDrag: (event: ReactPointerEvent<HTMLButtonElement>, params: BeginWeekDragParams) => void;
  /** Lee (y limpia) si el último gesto fue un arrastre real, para que el `onClick` nativo lo ignore. */
  consumeSuppressedClick: () => boolean;
}

/**
 * Gestiona el gesto de arrastrar citas en la parrilla de semana con Pointer
 * Events. Calcada de `useAppointmentDrag` en `day-grid.tsx` (mismo patrón de
 * refs + rAF + limpieza en `window`), pero simplificada a un único modo
 * "mover" (sin redimensionar) y con día+hora en vez de profesional+hora.
 * Trabaja contra el eje elástico (`timeline`), igual que la vista Día.
 */
function useWeekAppointmentDrag({
  timeline,
  windowStart,
  windowEnd,
  timezone,
  onMoveAppointment,
}: UseWeekAppointmentDragOptions): UseWeekAppointmentDragResult {
  const [dragState, setDragState] = useState<WeekDragState | null>(null);
  const [tooltip, setTooltip] = useState<WeekDragTooltip | null>(null);

  const stateRef = useRef<WeekDragState | null>(null);
  const movedRef = useRef(false);
  const tooltipRef = useRef<WeekDragTooltip | null>(null);
  const rafRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const originColumnLeftRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Si el componente se desmonta a media faena (p. ej. cambio de semana
  // durante el arrastre), retira los listeners de `window` para no dejarlos huérfanos.
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
        date: finalState.liveDate,
        startMin: finalState.liveStartMin,
        durationMin: finalState.durationMin,
      });
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, params: BeginWeekDragParams): void {
    if (event.button !== 0 || stateRef.current) return;
    const { appointment, date, startMin, durationMin } = params;

    const originColumn = event.currentTarget.closest<HTMLElement>("[data-week-date]");
    originColumnLeftRef.current = originColumn ? originColumn.getBoundingClientRect().left : null;

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const originY = timeline.yAt(startMin);

    const initial: WeekDragState = {
      appointment,
      durationMin,
      liveDate: date,
      liveStartMin: startMin,
      translateX: 0,
    };
    stateRef.current = initial;
    movedRef.current = false;
    setDragState(initial);
    document.body.style.userSelect = "none";

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    // jsdom (entorno de test) no implementa la captura de puntero — se
    // comprueba el método antes de llamarlo (mismo motivo que day-grid.tsx).
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

      const rawStartMin = timeline.minAt(originY + dy);
      const snappedStart = snapMinutes(rawStartMin, SLOT_SNAP_MIN);
      const clampedStart = Math.max(
        windowStart,
        Math.min(windowEnd - current.durationMin, snappedStart),
      );

      const targetColumn = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>("[data-week-date]");
      const targetDate = targetColumn?.getAttribute("data-week-date") ?? current.liveDate;
      const originLeft = originColumnLeftRef.current;
      const translateX =
        targetColumn && originLeft !== null
          ? targetColumn.getBoundingClientRect().left - originLeft
          : 0;

      const next: WeekDragState = {
        ...current,
        liveDate: targetDate,
        liveStartMin: clampedStart,
        translateX,
      };
      stateRef.current = next;

      tooltipRef.current = {
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        label: `${capitalize(shortWeekdayLabel(next.liveDate, timezone))} ${minutesToLabel(next.liveStartMin)}`,
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

export function WeekGrid({
  salonId,
  weekDates,
  timezone,
  todayDate,
  professionals,
  onSelectAppointment,
  onSelectSlot,
  onMoveAppointment,
}: WeekGridProps): React.ReactElement {
  const rangeStart = weekDates[0] ?? todayDate;
  const lastWeekDate = weekDates[6] ?? todayDate;
  const rangeEndExclusive = addLocalDays(lastWeekDate, 1);

  const appointmentsQuery = useAppointmentsRange(salonId, rangeStart, rangeEndExclusive, timezone);
  const scheduleQuery = useSalonSchedule(salonId);

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

  // Alto real (px) del contenedor con scroll — con esto la escala de tiempo
  // se adapta a la pantalla en vez de usar un `TIMELINE_BASE` fijo (ver
  // `pxPerMinBase` más abajo). 0 hasta el primer `ResizeObserver` (SSR/primer
  // pintado), momento en el que se usa el fallback fijo — nunca hay una
  // rejilla a 0px. Los deps de pending/error hacen que el efecto se reintente
  // cuando el skeleton/error deja paso a la rejilla real.
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
  }, [appointmentsQuery.isPending, appointmentsQuery.isError]);

  const professionalIds = useMemo(
    () => new Set(professionals.map((professional) => professional.id)),
    [professionals],
  );
  const weekDateSet = useMemo(() => new Set(weekDates), [weekDates]);

  // Horario de apertura del salón agrupado por día de la semana (0=dom..6=sáb).
  const openingByWeekday = useMemo(() => {
    const map = new Map<number, OpeningRange[]>();
    for (const row of scheduleQuery.data ?? []) {
      const range: OpeningRange = { startMin: toMinutes(row.start_time), endMin: toMinutes(row.end_time) };
      const existing = map.get(row.weekday);
      if (existing) existing.push(range);
      else map.set(row.weekday, [range]);
    }
    return map;
  }, [scheduleQuery.data]);

  // Lo mismo, pero indexado por cada fecha concreta de la semana visible.
  const openingByDate = useMemo(() => {
    const map = new Map<string, OpeningRange[]>();
    for (const date of weekDates) {
      map.set(date, openingByWeekday.get(weekdayOfLocalDate(date)) ?? []);
    }
    return map;
  }, [weekDates, openingByWeekday]);

  const positioned = useMemo<PositionedAppointment[]>(() => {
    const rows: PositionedAppointment[] = [];
    for (const appointment of appointmentsQuery.data ?? []) {
      if (!professionalIds.has(appointment.professional_id)) continue;
      const date = localDateInZone(timezone, new Date(appointment.starts_at));
      if (!weekDateSet.has(date)) continue;
      const startMin = agendaLocalMinutes(appointment.starts_at, timezone);
      // Duración REAL de la cita (starts_at → ends_at), no la del servicio: una
      // cita movida/acortada refleja su hueco real, como el texto de horas.
      const durationMin = Math.max(
        1,
        Math.round((Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60000),
      );
      rows.push({ appointment, date, startMin, durationMin });
    }
    return rows;
  }, [appointmentsQuery.data, professionalIds, timezone, weekDateSet]);

  // Ventana visible = horario real de apertura de la semana (mismo criterio que
  // la vista Día: se respeta el horario tal cual, sin acotarlo a un rango fijo)
  // o el fallback 08–21 si aún no hay horario; SIEMPRE ampliada para incluir
  // cualquier cita que caiga fuera (nunca se recorta una cita) y redondeada a la
  // hora para etiquetas limpias.
  const weekWindow = useMemo<OpeningRange>(() => {
    const allRanges = weekDates.flatMap((date) => openingByDate.get(date) ?? []);
    let startMin =
      allRanges.length > 0
        ? Math.min(...allRanges.map((range) => range.startMin))
        : FALLBACK_WINDOW.startMin;
    let endMin =
      allRanges.length > 0
        ? Math.max(...allRanges.map((range) => range.endMin))
        : FALLBACK_WINDOW.endMin;
    for (const item of positioned) {
      startMin = Math.min(startMin, item.startMin);
      endMin = Math.max(endMin, item.startMin + item.durationMin);
    }
    startMin = Math.floor(startMin / 60) * 60;
    endMin = Math.ceil(endMin / 60) * 60;
    return endMin > startMin ? { startMin, endMin } : FALLBACK_WINDOW;
  }, [weekDates, openingByDate, positioned]);

  // No se pintan franjas "Cerrado" hasta que el horario ha cargado: si no,
  // mientras `useSalonSchedule` está pendiente `openingByDate` es todo [] y los
  // 7 días aparecerían como una única banda "Cerrado" a pantalla completa (la
  // vista Día no hace eso). Se distingue "sin datos aún" de "día cerrado".
  const scheduleReady = scheduleQuery.isSuccess;
  const closedByDate = useMemo(() => {
    const map = new Map<string, OpeningRange[]>();
    if (!scheduleReady) return map;
    for (const date of weekDates) {
      map.set(date, closedBandsForDay(openingByDate.get(date) ?? [], weekWindow));
    }
    return map;
  }, [weekDates, openingByDate, weekWindow, scheduleReady]);

  const byDate = useMemo(() => {
    const map = new Map<string, PositionedAppointment[]>();
    for (const item of positioned) {
      const existing = map.get(item.date);
      if (existing) existing.push(item);
      else map.set(item.date, [item]);
    }
    return map;
  }, [positioned]);

  // Ítems del eje elástico: TODAS las citas de la semana (para que el estiraje
  // de cualquier día mantenga las horas alineadas entre las 7 columnas).
  const timelineItems = useMemo<TimelineItem[]>(
    () => positioned.map((item) => ({ startMin: item.startMin, durationMin: item.durationMin })),
    [positioned],
  );

  // `base` DINÁMICO: hasta medir el contenedor, el `TIMELINE_BASE` fijo;
  // después, el que hace que la ventana llene el alto disponible, sin bajar del
  // suelo legible. El estiraje elástico sigue ganando para las tarjetas cortas.
  const pxPerMinBase = useMemo(() => {
    if (viewportHeight <= 0) return TIMELINE_BASE;
    const windowMinutes = weekWindow.endMin - weekWindow.startMin;
    const available = Math.max(
      viewportHeight - WEEK_HEADER_PX - VIEWPORT_BREATHING_ROOM_PX - TIMELINE_TOP_PAD_PX,
      0,
    );
    return windowMinutes > 0 ? Math.max(MIN_PX_PER_MIN, available / windowMinutes) : MIN_PX_PER_MIN;
  }, [viewportHeight, weekWindow]);

  const timeline = useMemo(
    () =>
      buildDayTimeline(timelineItems, {
        dayStartMin: weekWindow.startMin,
        dayEndMin: weekWindow.endMin,
        base: pxPerMinBase,
        minCard: TIMELINE_MIN_CARD,
        extra: 0,
      }),
    [timelineItems, weekWindow, pxPerMinBase],
  );

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    const first = Math.ceil(weekWindow.startMin / 60) * 60;
    for (let t = first; t <= weekWindow.endMin; t += 60) marks.push(t);
    return marks;
  }, [weekWindow]);

  // Hook de arrastre. Se llama SIEMPRE (antes de los `return` condicionales
  // de abajo) para respetar las reglas de hooks — igual que en DayGrid.
  const drag = useWeekAppointmentDrag({
    timeline,
    windowStart: weekWindow.startMin,
    windowEnd: weekWindow.endMin,
    timezone,
    onMoveAppointment,
  });
  const canDrag = onMoveAppointment !== undefined;

  if (appointmentsQuery.isPending) {
    return <WeekGridSkeleton />;
  }
  if (appointmentsQuery.isError) {
    return <WeekGridError />;
  }

  const gridTemplateColumns = `${GUTTER_WIDTH}px repeat(7, minmax(0, 1fr))`;

  return (
    <>
      {/* Sin padding-top aquí a propósito (ver day-grid.tsx): el gap visual
      bajo la cabecera sticky se consigue con el margin-top del wrapper de
      abajo, no con padding en el contenedor con scroll. */}
      <div ref={scrollRef} className="h-full overflow-auto">
        <div className="mb-4 mt-3 min-w-[760px] rounded-xl border border-border bg-[var(--glass-bg-dense)] shadow-sm backdrop-blur-xl">
          <div
            className="sticky top-0 z-20 grid rounded-t-xl border-b border-border bg-card shadow-md"
            style={{ gridTemplateColumns }}
          >
            <div aria-hidden="true" />
            {weekDates.map((date) => (
              <WeekDayHeaderCell key={date} date={date} timezone={timezone} isToday={date === todayDate} />
            ))}
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

            {weekDates.map((date) => (
              <WeekDayColumn
                key={date}
                date={date}
                timezone={timezone}
                isToday={date === todayDate}
                items={byDate.get(date) ?? []}
                timeline={timeline}
                windowStart={weekWindow.startMin}
                windowEnd={weekWindow.endMin}
                hourMarks={hourMarks}
                closedRanges={closedByDate.get(date) ?? []}
                nowMin={nowMin}
                onSelectAppointment={onSelectAppointment}
                onSelectSlot={onSelectSlot}
                drag={drag}
                canDrag={canDrag}
              />
            ))}

            {positioned.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
                <CalendarDays className="h-6 w-6 text-muted-foreground/70" aria-hidden="true" />
                <p className="text-sm font-medium text-muted-foreground">Sin citas esta semana</p>
                <p className="max-w-[240px] text-xs text-muted-foreground/80">
                  Haz clic en un hueco libre para crear una cita.
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

function WeekGridSkeleton(): React.ReactElement {
  const gridTemplateColumns = `${GUTTER_WIDTH}px repeat(7, minmax(0, 1fr))`;

  return (
    <div className="h-full overflow-hidden">
      <div className="mb-4 mt-3 min-w-[760px] rounded-xl border border-border bg-[var(--glass-bg-dense)] shadow-sm backdrop-blur-xl">
        <div className="grid rounded-t-xl border-b border-border" style={{ gridTemplateColumns }}>
          <div aria-hidden="true" />
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1.5 border-r border-border px-2.5 py-2 last:border-r-0">
              <Skeleton className="h-2.5 w-6" />
              <Skeleton className="h-4 w-4" />
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns }}>
          <div aria-hidden="true" />
          {Array.from({ length: 7 }, (_, colIndex) => (
            <div key={colIndex} className="flex flex-col gap-2 border-r border-border p-2 last:border-r-0">
              {[64, 96, 48].map((cardHeight, rowIndex) => (
                <Skeleton
                  key={rowIndex}
                  className="w-full shrink-0 rounded-md"
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

function WeekGridError(): React.ReactElement {
  return (
    <div className="mb-4 mt-3 flex min-h-[320px] min-w-[760px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-[var(--glass-bg-dense)] p-8 text-center shadow-sm backdrop-blur-xl">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="font-semibold text-foreground">No se ha podido cargar la semana</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ha ocurrido un problema al conectar con el servidor. Vuelve a intentarlo en unos segundos.
      </p>
    </div>
  );
}

interface WeekDayHeaderCellProps {
  date: string;
  timezone: string;
  isToday: boolean;
}

function WeekDayHeaderCell({ date, timezone, isToday }: WeekDayHeaderCellProps): React.ReactElement {
  const dayNumber = Number(date.slice(8, 10));
  return (
    <div className="flex flex-col items-start gap-0.5 border-r border-border px-2.5 py-2 last:border-r-0">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {capitalize(shortWeekdayLabel(date, timezone))}
      </span>
      <span
        className={cn(
          "text-[15px] font-bold leading-none text-card-foreground",
          isToday && "text-primary",
        )}
      >
        {dayNumber}
      </span>
    </div>
  );
}

interface WeekDayColumnProps {
  date: string;
  timezone: string;
  isToday: boolean;
  items: PositionedAppointment[];
  timeline: DayTimeline;
  windowStart: number;
  windowEnd: number;
  hourMarks: number[];
  closedRanges: OpeningRange[];
  nowMin: number;
  onSelectAppointment: (appointment: AppointmentWithDetails) => void;
  onSelectSlot: (date: string, startMin: number) => void;
  /** Estado/handlers de arrastre compartidos por toda la parrilla (una sola instancia por `WeekGrid`). */
  drag: UseWeekAppointmentDragResult;
  /** `true` si el padre pasó `onMoveAppointment` — controla si esta columna ofrece tarjetas arrastrables. */
  canDrag: boolean;
}

function WeekDayColumn({
  date,
  timezone,
  isToday,
  items,
  timeline,
  windowStart,
  windowEnd,
  hourMarks,
  closedRanges,
  nowMin,
  onSelectAppointment,
  onSelectSlot,
  drag,
  canDrag,
}: WeekDayColumnProps): React.ReactElement {
  const showNowLine = isToday && nowMin >= windowStart && nowMin <= windowEnd;

  // Reparto en carriles de las citas solapadas de ESTE día (paralelo a `items`).
  // Memoizado sobre `items` (referencia estable de `byDate`) para no recalcular
  // el reparto en cada frame de arrastre (el rAF re-renderiza toda la parrilla).
  const placements = useMemo(
    () =>
      layoutLanes(
        items.map((item) => ({ startMin: item.startMin, endMin: item.startMin + item.durationMin })),
      ),
    [items],
  );

  return (
    <div
      data-week-date={date}
      className="relative cursor-pointer border-r border-border transition-colors hover:bg-muted/30 last:border-r-0"
      style={{ height: timeline.total }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const y = event.clientY - rect.top;
        onSelectSlot(date, snapMinutes(timeline.minAt(y), SLOT_SNAP_MIN));
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
            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Cerrado
            </span>
          </div>
        );
      })}

      {items.map(({ appointment, startMin, durationMin }, index) => {
        const placement = placements[index] ?? { lane: 0, lanes: 1 };
        const currentDragState = drag.dragState;
        const activeDrag =
          currentDragState && currentDragState.appointment.id === appointment.id ? currentDragState : null;
        const liveStartMin = activeDrag?.liveStartMin ?? startMin;
        const cardTop = timeline.yAt(liveStartMin);
        const cardHeight = Math.max(timeline.yAt(liveStartMin + durationMin) - cardTop - CARD_GAP_PX, 28);
        const draggable =
          canDrag && (appointment.status === "pending" || appointment.status === "confirmed");
        return (
          <WeekAppointmentCard
            key={appointment.id}
            appointment={appointment}
            timezone={timezone}
            top={cardTop}
            height={cardHeight}
            lane={placement.lane}
            laneCount={placement.lanes}
            translateX={activeDrag?.translateX ?? 0}
            draggable={draggable}
            isDragging={activeDrag !== null}
            onSelect={onSelectAppointment}
            consumeSuppressedClick={drag.consumeSuppressedClick}
            onDragPointerDown={
              draggable
                ? (event) => drag.beginDrag(event, { appointment, date, startMin, durationMin })
                : undefined
            }
          />
        );
      })}

      {showNowLine ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-destructive"
          style={{ top: timeline.yAt(nowMin) }}
        >
          <span
            className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-destructive"
            aria-hidden="true"
          />
        </div>
      ) : null}
    </div>
  );
}

interface WeekAppointmentCardProps {
  appointment: AppointmentWithDetails;
  timezone: string;
  top: number;
  height: number;
  /** Índice de carril y nº total de carriles del grupo de solape (ver `layoutLanes`). */
  lane: number;
  laneCount: number;
  /** Desplazamiento horizontal en vivo (px) mientras se arrastra a otra columna/día. */
  translateX: number;
  /** `pending`/`confirmed` + el padre pasó `onMoveAppointment`. */
  draggable: boolean;
  /** Esta tarjeta concreta es la que se está arrastrando ahora mismo. */
  isDragging: boolean;
  onSelect: (appointment: AppointmentWithDetails) => void;
  /** Ausente cuando `draggable` es `false` — sin él, la tarjeta es solo-click. */
  onDragPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  consumeSuppressedClick: () => boolean;
}

function WeekAppointmentCard({
  appointment,
  timezone,
  top,
  height,
  lane,
  laneCount,
  translateX,
  draggable,
  isDragging,
  onSelect,
  onDragPointerDown,
  consumeSuppressedClick,
}: WeekAppointmentCardProps): React.ReactElement {
  const isCancelled = appointment.status === "cancelled";
  const startLabel = formatSlotTime(appointment.starts_at, timezone);
  const firstName = (appointment.customer?.full_name ?? "Cliente").split(" ")[0] ?? "Cliente";

  // Ancho/posición horizontal según el carril: 1/laneCount del ancho de la
  // columna, con un pequeño hueco a ambos lados y entre carriles.
  const laneWidthPct = 100 / laneCount;
  const leftPct = lane * laneWidthPct;
  // Con 3+ citas simultáneas el carril es demasiado estrecho para "hora +
  // nombre": se prioriza el NOMBRE (más el acento de color del profesional,
  // que ya identifica la cita) y se omite la hora, que se ve en el detalle al
  // pulsar. Así el texto que queda es legible en vez de recortarse todo.
  const showTime = laneCount < 3;

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    onDragPointerDown?.(event);
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
        "absolute z-[3] flex flex-col overflow-hidden rounded-md border px-1.5 py-0.5 text-left shadow-xs transition-shadow duration-150 hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        STATUS_CARD_CLASSES[appointment.status],
        isCancelled && "line-through",
        draggable ? "cursor-grab touch-none select-none" : "cursor-default",
        isDragging && "z-30 cursor-grabbing shadow-md transition-none",
      )}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + ${LANE_GAP_PX}px)`,
        width: `calc(${laneWidthPct}% - ${LANE_GAP_PX * 2}px)`,
        transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: appointment.professional?.color ?? "hsl(var(--muted-foreground))" }}
        aria-hidden="true"
      />
      {showTime ? (
        <span className="truncate pl-1 text-[10px] font-semibold leading-none tabular-nums opacity-85">
          {startLabel}
        </span>
      ) : null}
      <span className="truncate pl-1 text-[11px] font-semibold leading-tight">{firstName}</span>
    </button>
  );
}
