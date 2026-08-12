"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, CalendarDays } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useAppointmentsRange } from "@/hooks/use-appointments";
import { useSalonSchedule } from "@/hooks/use-schedules";
import { agendaLocalMinutes } from "@/lib/agenda/day-model";
import { snapMinutes } from "@/lib/agenda/timeline";
import { formatSlotTime } from "@/lib/booking/format";
import { localDateInZone, weekdayOfLocalDate } from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";
import type { OpeningRange } from "@/lib/agenda/day-model";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { AppointmentStatus } from "@/types/database";

/**
 * WeekGrid — parrilla horaria de la semana (7 columnas de día × eje de horas).
 *
 * Porta la vista "Semana" del mockup aprobado
 * (docs/superpowers/reference/2026-08-12-agenda-mockup.html → `renderWeek` +
 * `bindWeekDrag`) a Tailwind + tokens de Kairos. A diferencia de `DayGrid`
 * (columnas = profesionales, eje ELÁSTICO), aquí las columnas son los 7 días
 * de la semana y el eje de tiempo es LINEAL (`PX_PER_MIN` fijo): no hace
 * falta estirar franjas porque cada bloque ya es compacto (hora + nombre,
 * sin servicio ni notas — igual que `.week .appt` en el mockup).
 *
 * Reutiliza de `day-grid.tsx`: la cabecera STICKY + OPACA con z-index alto,
 * el cuerpo con su propio contexto de apilado (z-index 0), el truco de NO
 * padding-top en el contenedor con scroll (usa margin-top en su lugar), y
 * el mismo tinte por estado (`STATUS_CARD_CLASSES`).
 *
 * A diferencia de `DayGrid` (puramente presentacional, recibe todo por
 * props), este componente SÍ llama a sus propios hooks de datos
 * (`useAppointmentsRange`, `useSalonSchedule`) — ambos "use client" sobre
 * `@/lib/supabase/client`, así que no cruza el límite RSC (nunca importa de
 * `@/lib/salon`).
 *
 * Arrastre (mover, sin redimensionar — la semana no tiene grip): vertical
 * cambia la hora (snap 5 min contra el eje lineal, acotado a la ventana),
 * horizontal cruza de columna/día (se detecta la columna bajo el puntero vía
 * `data-week-date` + `document.elementFromPoint`, igual que `DayGrid` hace
 * con `data-professional-id`). Solo tarjetas `pending`/`confirmed`, y solo si
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
/** Escala LINEAL: px por hora (dentro del rango 48–56 pedido) → px por minuto. */
const HOUR_PX = 52;
const PX_PER_MIN = HOUR_PX / 60;
/** Ventana de fallback cuando no hay horario de apertura (o la unión, ya acotada, colapsa). */
const FALLBACK_WINDOW: OpeningRange = { startMin: 8 * 60, endMin: 21 * 60 };
/** Snap al pulsar un hueco vacío, y también al arrastrar citas (minutos). */
const SLOT_SNAP_MIN = 5;
/** Umbral de movimiento (px) antes de considerar un puntero-abajo un arrastre real y no un click. */
const DRAG_MOVE_THRESHOLD_PX = 3;

/** Mismo tinte por estado que `day-grid.tsx` (bg-X/10 + border-X/30 + text-X): nunca color crudo. */
const STATUS_CARD_CLASSES: Record<AppointmentStatus, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  confirmed: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-success/30 bg-success/10 text-success",
  cancelled: "border-destructive/25 bg-destructive/8 text-destructive",
  no_show: "border-border bg-muted text-muted-foreground",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
  const hours = Math.floor(min / 60);
  const mins = min % 60;
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

interface WeekScale {
  /** Píxel del eje para un minuto dado (clampa a [windowStart, windowEnd]). */
  yAt(min: number): number;
  /** Minuto del eje para un píxel dado (inversa de `yAt`, clampa a [0, totalHeight]). */
  minAt(y: number): number;
  totalHeight: number;
  windowStart: number;
  windowEnd: number;
}

/** Eje de tiempo LINEAL (sin estirar franjas) — la semana no necesita la elasticidad del Día. */
function buildWeekScale(windowStart: number, windowEnd: number, pxPerMin: number): WeekScale {
  const totalHeight = Math.max((windowEnd - windowStart) * pxPerMin, 0);
  function yAt(min: number): number {
    const clamped = Math.max(windowStart, Math.min(windowEnd, min));
    return (clamped - windowStart) * pxPerMin;
  }
  function minAt(y: number): number {
    const clamped = Math.max(0, Math.min(totalHeight, y));
    return windowStart + clamped / pxPerMin;
  }
  return { yAt, minAt, totalHeight, windowStart, windowEnd };
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
  scale: WeekScale;
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
 */
function useWeekAppointmentDrag({
  scale,
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
    const originY = scale.yAt(startMin);

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

      const rawStartMin = scale.minAt(originY + dy);
      const snappedStart = snapMinutes(rawStartMin, SLOT_SNAP_MIN);
      const clampedStart = Math.max(
        scale.windowStart,
        Math.min(scale.windowEnd - current.durationMin, snappedStart),
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

  // Ventana visible = unión de los rangos de apertura de la semana, acotada
  // (clamp) al fallback 08:00–21:00; si no hay ningún rango, usa el fallback entero.
  const weekWindow = useMemo<OpeningRange>(() => {
    const allRanges = weekDates.flatMap((date) => openingByDate.get(date) ?? []);
    if (allRanges.length === 0) return FALLBACK_WINDOW;
    const rawStart = Math.min(...allRanges.map((range) => range.startMin));
    const rawEnd = Math.max(...allRanges.map((range) => range.endMin));
    const startMin = clamp(rawStart, FALLBACK_WINDOW.startMin, FALLBACK_WINDOW.endMin);
    const endMin = clamp(rawEnd, FALLBACK_WINDOW.startMin, FALLBACK_WINDOW.endMin);
    return endMin > startMin ? { startMin, endMin } : FALLBACK_WINDOW;
  }, [weekDates, openingByDate]);

  const closedByDate = useMemo(() => {
    const map = new Map<string, OpeningRange[]>();
    for (const date of weekDates) {
      map.set(date, closedBandsForDay(openingByDate.get(date) ?? [], weekWindow));
    }
    return map;
  }, [weekDates, openingByDate, weekWindow]);

  const scale = useMemo(
    () => buildWeekScale(weekWindow.startMin, weekWindow.endMin, PX_PER_MIN),
    [weekWindow],
  );

  const positioned = useMemo<PositionedAppointment[]>(() => {
    const rows: PositionedAppointment[] = [];
    for (const appointment of appointmentsQuery.data ?? []) {
      if (!professionalIds.has(appointment.professional_id)) continue;
      const date = localDateInZone(timezone, new Date(appointment.starts_at));
      if (!weekDateSet.has(date)) continue;
      const startMin = agendaLocalMinutes(appointment.starts_at, timezone);
      const durationMin =
        appointment.service?.duration_minutes ??
        Math.round((Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60000);
      rows.push({ appointment, date, startMin, durationMin });
    }
    return rows;
  }, [appointmentsQuery.data, professionalIds, timezone, weekDateSet]);

  const byDate = useMemo(() => {
    const map = new Map<string, PositionedAppointment[]>();
    for (const item of positioned) {
      const existing = map.get(item.date);
      if (existing) existing.push(item);
      else map.set(item.date, [item]);
    }
    return map;
  }, [positioned]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    const first = Math.ceil(weekWindow.startMin / 60) * 60;
    for (let t = first; t <= weekWindow.endMin; t += 60) marks.push(t);
    return marks;
  }, [weekWindow]);

  // Hook de arrastre. Se llama SIEMPRE (antes de los `return` condicionales
  // de abajo) para respetar las reglas de hooks — igual que en DayGrid.
  const drag = useWeekAppointmentDrag({ scale, timezone, onMoveAppointment });
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
      <div className="h-full overflow-auto">
        <div className="mb-4 mt-3 min-w-[760px] rounded-xl border border-border bg-card shadow-sm">
          <div
            className="sticky top-0 z-20 grid rounded-t-xl border-b border-border bg-card shadow-md"
            style={{ gridTemplateColumns }}
          >
            <div aria-hidden="true" />
            {weekDates.map((date) => (
              <WeekDayHeaderCell key={date} date={date} timezone={timezone} isToday={date === todayDate} />
            ))}
          </div>

          <div className="relative z-0 grid" style={{ gridTemplateColumns, height: scale.totalHeight }}>
            <div className="relative" style={{ height: scale.totalHeight }}>
              {hourMarks.map((min) => (
                <div
                  key={min}
                  className="pointer-events-none absolute right-2 -translate-y-1/2 bg-card px-1 text-[11px] font-medium text-muted-foreground"
                  style={{ top: scale.yAt(min) }}
                >
                  {minutesToLabel(min)}
                </div>
              ))}
            </div>

            {weekDates.map((date) => (
              <WeekDayColumn
                key={date}
                date={date}
                timezone={timezone}
                isToday={date === todayDate}
                items={byDate.get(date) ?? []}
                scale={scale}
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
      <div className="mb-4 mt-3 min-w-[760px] rounded-xl border border-border bg-card shadow-sm">
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
    <div className="mb-4 mt-3 flex min-h-[320px] min-w-[760px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
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
  scale: WeekScale;
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
  scale,
  hourMarks,
  closedRanges,
  nowMin,
  onSelectAppointment,
  onSelectSlot,
  drag,
  canDrag,
}: WeekDayColumnProps): React.ReactElement {
  const showNowLine = isToday && nowMin >= scale.windowStart && nowMin <= scale.windowEnd;

  return (
    <div
      data-week-date={date}
      className="relative cursor-pointer border-r border-border transition-colors hover:bg-muted/30 last:border-r-0"
      style={{ height: scale.totalHeight }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const y = event.clientY - rect.top;
        onSelectSlot(date, snapMinutes(scale.minAt(y), SLOT_SNAP_MIN));
      }}
    >
      {hourMarks.map((min) => (
        <div
          key={min}
          className="pointer-events-none absolute inset-x-0 border-t border-border"
          style={{ top: scale.yAt(min) }}
        />
      ))}

      {closedRanges.map((range) => {
        const bandTop = scale.yAt(range.startMin);
        const bandHeight = scale.yAt(range.endMin) - bandTop;
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

      {items.map(({ appointment, startMin, durationMin }) => {
        const currentDragState = drag.dragState;
        const activeDrag =
          currentDragState && currentDragState.appointment.id === appointment.id ? currentDragState : null;
        const liveStartMin = activeDrag?.liveStartMin ?? startMin;
        const cardTop = scale.yAt(liveStartMin);
        const cardHeight = Math.max(durationMin * PX_PER_MIN - 2, 16);
        const draggable =
          canDrag && (appointment.status === "pending" || appointment.status === "confirmed");
        return (
          <WeekAppointmentCard
            key={appointment.id}
            appointment={appointment}
            timezone={timezone}
            top={cardTop}
            height={cardHeight}
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
          style={{ top: scale.yAt(nowMin) }}
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
        "absolute inset-x-1 z-[3] flex flex-col overflow-hidden rounded-md border px-1.5 py-0.5 text-left shadow-xs transition-shadow duration-150 hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        STATUS_CARD_CLASSES[appointment.status],
        isCancelled && "line-through",
        draggable ? "cursor-grab touch-none select-none" : "cursor-default",
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
        style={{ backgroundColor: appointment.professional?.color ?? "hsl(var(--muted-foreground))" }}
        aria-hidden="true"
      />
      <span className="truncate pl-1 text-[10px] font-semibold leading-none tabular-nums opacity-85">
        {startLabel}
      </span>
      <span className="truncate pl-1 text-[11px] font-semibold leading-tight">{firstName}</span>
    </button>
  );
}
