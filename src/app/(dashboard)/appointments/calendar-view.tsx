"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { appointmentStatusDot } from "@/components/appointments/appointment-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatSlotTime } from "@/lib/booking/format";
import { localDateInZone } from "@/lib/booking/timezone";
import { useAppointmentsRange } from "@/hooks/use-appointments";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";

export type CalendarMode = "semana" | "mes" | "ano";

interface CalendarViewProps {
  salonId: string;
  timezone: string;
  mode: CalendarMode;
  /** Fecha ancla "YYYY-MM-DD" (día de referencia de la vista). */
  date: string;
  onDateChange: (date: string) => void;
  /** Al pinchar un día concreto → saltar a la vista de día del panel. */
  onPickDay: (date: string) => void;
}

// ── Helpers de fecha (puros, en UTC para evitar líos de zona/DST) ────────────
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function parse(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}
function toUtc(s: string): number {
  const { y, m, d } = parse(s);
  return Date.UTC(y, m - 1, d);
}
function fromUtc(ms: number): string {
  const dt = new Date(ms);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function addDays(s: string, n: number): string {
  return fromUtc(toUtc(s) + n * 86_400_000);
}
/** Día de la semana con lunes = 0 … domingo = 6. */
function weekday(s: string): number {
  const { y, m, d } = parse(s);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
function startOfWeek(s: string): string {
  return addDays(s, -weekday(s));
}
function startOfMonth(s: string): string {
  const { y, m } = parse(s);
  return ymd(y, m, 1);
}
function addMonths(s: string, n: number): string {
  const { y, m, d } = parse(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return ymd(ny, nm, Math.min(d, dim));
}

/** Fecha local "YYYY-MM-DD" de un ISO en la zona del salón. */
function localYmd(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function label(ms: number, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", ...opts }).format(new Date(ms));
}

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function CalendarView({
  salonId,
  timezone,
  mode,
  date,
  onDateChange,
  onPickDay,
}: CalendarViewProps): React.ReactElement {
  const today = localDateInZone(timezone);

  // Rango [start, endExclusive) a pedir según la vista.
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (mode === "semana") {
      const s = startOfWeek(date);
      return { rangeStart: s, rangeEnd: addDays(s, 7) };
    }
    if (mode === "mes") {
      const gridStart = startOfWeek(startOfMonth(date));
      return { rangeStart: gridStart, rangeEnd: addDays(gridStart, 42) };
    }
    // año
    const { y } = parse(date);
    return { rangeStart: ymd(y, 1, 1), rangeEnd: ymd(y + 1, 1, 1) };
  }, [mode, date]);

  const query = useAppointmentsRange(salonId, rangeStart, rangeEnd, timezone);

  // Agrupar citas por día local.
  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentWithDetails[]>();
    for (const a of query.data ?? []) {
      const key = localYmd(a.starts_at, timezone);
      const list = map.get(key);
      if (list) list.push(a);
      else map.set(key, [a]);
    }
    return map;
  }, [query.data, timezone]);

  function shift(dir: -1 | 1): void {
    if (mode === "semana") onDateChange(addDays(date, dir * 7));
    else if (mode === "mes") onDateChange(addMonths(date, dir));
    else onDateChange(addMonths(date, dir * 12));
  }

  const headerLabel =
    mode === "semana"
      ? `${label(toUtc(startOfWeek(date)), { day: "numeric", month: "short" })} – ${label(
          toUtc(addDays(startOfWeek(date), 6)),
          { day: "numeric", month: "short", year: "numeric" },
        )}`
      : mode === "mes"
        ? label(toUtc(startOfMonth(date)), { month: "long", year: "numeric" })
        : String(parse(date).y);

  return (
    <div className="animate-fade-in">
      {/* Navegación de rango */}
      <div className="mb-5 flex items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Anterior</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-4"
            onClick={() => onDateChange(today)}
          >
            Hoy
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => shift(1)}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Siguiente</span>
          </Button>
        </div>
        <span className="text-sm font-medium capitalize text-foreground/80">
          {headerLabel}
        </span>
      </div>

      {query.isPending ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : query.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(query.error as Error).message}
        </div>
      ) : mode === "semana" ? (
        <WeekGrid
          weekStart={startOfWeek(date)}
          today={today}
          byDay={byDay}
          timezone={timezone}
          onPickDay={onPickDay}
        />
      ) : mode === "mes" ? (
        <MonthGrid
          gridStart={rangeStart}
          monthRef={date}
          today={today}
          byDay={byDay}
          timezone={timezone}
          onPickDay={onPickDay}
        />
      ) : (
        <YearGrid
          year={parse(date).y}
          today={today}
          byDay={byDay}
          onPickDay={onPickDay}
        />
      )}
    </div>
  );
}

// ── Vista semana: 7 columnas con las citas de cada día ───────────────────────
function WeekGrid({
  weekStart,
  today,
  byDay,
  timezone,
  onPickDay,
}: {
  weekStart: string;
  today: string;
  byDay: Map<string, AppointmentWithDetails[]>;
  timezone: string;
  onPickDay: (d: string) => void;
}): React.ReactElement {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="overflow-x-auto">
      {/* Móvil: los 7 días se apilan (una columna). md+: rejilla de 7 columnas. */}
      <div className="grid grid-cols-1 gap-2 md:min-w-[46rem] md:grid-cols-7">
        {days.map((day, i) => {
          const list = byDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <div key={day} className="flex flex-col rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => onPickDay(day)}
                className={cn(
                  "flex items-center justify-between rounded-t-xl px-3 py-2 text-left transition-colors hover:bg-accent",
                  isToday && "bg-primary/10",
                )}
              >
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  {WEEKDAYS[i]}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    isToday && "text-primary",
                  )}
                >
                  {parse(day).d}
                </span>
              </button>
              <div className="flex flex-col gap-1 p-2">
                {list.length === 0 ? (
                  <span className="px-1 py-2 text-center text-xs text-muted-foreground/50">
                    —
                  </span>
                ) : (
                  list.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPickDay(day)}
                      className="flex items-center gap-1.5 rounded-md bg-muted/60 px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <span
                        className={cn("h-2 w-2 shrink-0 rounded-full", appointmentStatusDot(a.status))}
                      />
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatSlotTime(a.starts_at, timezone)}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {a.customer?.full_name ?? "—"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vista mes: rejilla 6×7, con hasta 3 citas por día ────────────────────────
function MonthGrid({
  gridStart,
  monthRef,
  today,
  byDay,
  timezone,
  onPickDay,
}: {
  gridStart: string;
  monthRef: string;
  today: string;
  byDay: Map<string, AppointmentWithDetails[]>;
  timezone: string;
  onPickDay: (d: string) => void;
}): React.ReactElement {
  const refMonth = parse(monthRef).m;
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="overflow-x-auto">
      {/* Móvil: el mes cabe en el ancho (celdas compactas con punto); sm+: detalle. */}
      <div className="sm:min-w-[42rem]">
        <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-2">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-1 text-center text-xs font-medium uppercase text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {cells.map((day) => {
            const list = byDay.get(day) ?? [];
            const inMonth = parse(day).m === refMonth;
            const isToday = day === today;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onPickDay(day)}
                className={cn(
                  "flex min-h-14 flex-col rounded-lg border p-1 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 sm:min-h-[5.5rem] sm:p-1.5",
                  inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground/60",
                  isToday && "border-primary ring-1 ring-primary/30",
                )}
              >
                <span
                  className={cn(
                    "mb-1 self-end text-xs font-semibold tabular-nums",
                    isToday && "text-primary",
                  )}
                >
                  {parse(day).d}
                </span>
                {/* Móvil: un punto con el número de citas del día (las celdas
                    son pequeñas y no caben las tarjetas). */}
                {list.length > 0 ? (
                  <span className="mt-auto flex items-center justify-center gap-1 pb-0.5 text-[10px] font-semibold text-primary sm:hidden">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {list.length}
                  </span>
                ) : null}
                {/* sm+: detalle de las citas del día. */}
                <div className="hidden flex-col gap-0.5 sm:flex">
                  {list.slice(0, 3).map((a) => (
                    <span
                      key={a.id}
                      className="flex items-center gap-1 truncate text-[11px] leading-tight"
                    >
                      <span
                        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", appointmentStatusDot(a.status))}
                      />
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatSlotTime(a.starts_at, timezone)}
                      </span>
                      <span className="truncate">{a.customer?.full_name ?? "—"}</span>
                    </span>
                  ))}
                  {list.length > 3 ? (
                    <span className="text-[11px] font-medium text-primary">
                      +{list.length - 3} más
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Vista año: 12 mini-meses, días con citas resaltados ──────────────────────
function YearGrid({
  year,
  today,
  byDay,
  onPickDay,
}: {
  year: number;
  today: string;
  byDay: Map<string, AppointmentWithDetails[]>;
  onPickDay: (d: string) => void;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, mi) => {
        const first = ymd(year, mi + 1, 1);
        const gridStart = startOfWeek(first);
        const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
        return (
          <div key={mi} className="rounded-xl border bg-card p-3">
            <p className="mb-2 text-sm font-semibold capitalize">
              {label(toUtc(first), { month: "long" })}
            </p>
            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[10px] font-medium text-muted-foreground/70">
                  {w}
                </div>
              ))}
              {cells.map((day) => {
                const inMonth = parse(day).m === mi + 1;
                const count = (byDay.get(day) ?? []).length;
                const isToday = day === today;
                if (!inMonth) {
                  return <span key={day} className="h-6" />;
                }
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onPickDay(day)}
                    className={cn(
                      "flex h-6 items-center justify-center rounded text-[11px] tabular-nums transition-colors hover:bg-accent",
                      count > 0 && "font-semibold text-primary",
                      count > 0 && count <= 2 && "bg-primary/10",
                      count > 2 && "bg-primary/25",
                      isToday && "ring-1 ring-primary",
                    )}
                    title={count > 0 ? `${count} cita(s)` : undefined}
                  >
                    {parse(day).d}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
