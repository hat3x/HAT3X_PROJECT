"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import {
  APPOINTMENT_STATUS_LABELS,
  appointmentStatusDot,
} from "@/components/appointments/appointment-status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/types/database";

/*
 * Salon OS — panel derecho de la agenda (mini-calendario + filtro de
 * profesionales + leyenda de estados).
 * ------------------------------------------------------------------
 * Puramente derivado de props: sin fetch, sin estado interno, sin IO.
 * El calendario se calcula con matemática de fechas en UTC (sin librería
 * externa) para que el resultado sea idéntico en servidor y cliente y no
 * dependa de la zona horaria de la máquina que renderiza.
 * Porta `.side` del mockup aprobado
 * (docs/superpowers/reference/2026-08-12-agenda-mockup.html) sobre los
 * primitivos de Kairos (tokens semánticos de color, nunca hex crudo salvo
 * el color de profesional, que es un dato configurable por el usuario).
 */

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"] as const;

/** Orden fijo de la leyenda de estados (coincide con el mockup). */
const STATUS_ORDER: readonly AppointmentStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

interface AgendaSidePanelProps {
  /** Mes mostrado en el mini-calendario, formato "YYYY-MM". */
  month: string;
  /** Día seleccionado (resaltado en el mini-calendario), formato "YYYY-MM-DD". */
  selectedDate: string;
  /** Días ("YYYY-MM-DD") con al menos una cita: reciben un punto indicador. */
  datesWithAppointments?: Set<string>;
  professionals: { id: string; full_name: string; color: string | null }[];
  /** Profesionales actualmente visibles en la parrilla. */
  activeProfessionalIds: Set<string>;
  onToggleProfessional: (id: string) => void;
  onSelectDate: (date: string) => void;
  /** Navega el mini-calendario ±N meses (-1 = anterior, 1 = siguiente). */
  onChangeMonth: (delta: number) => void;
}

// ── Matemática de calendario (pura, UTC) ─────────────────────────────────────
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Año + mes (1-12) desde una clave "YYYY-MM". Ante una clave mal formada, cae a un valor fijo en vez de romper el render. */
function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart ?? NaN);
  const month = Number(monthPart ?? NaN);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { year: 1970, month: 1 };
  }
  return { year, month };
}

function monthStartUtcMs(year: number, month: number): number {
  return Date.UTC(year, month - 1, 1);
}

/** Nº de días del mes (1-12) dado. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Día de la semana del día 1 del mes: lunes = 0 … domingo = 6. */
function firstWeekday(year: number, month: number): number {
  return (new Date(monthStartUtcMs(year, month)).getUTCDay() + 6) % 7;
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(monthStartUtcMs(year, month)));
}

/**
 * Panel derecho de la agenda: mini-calendario navegable, filtro de
 * profesionales (multi-selección) y leyenda de estados. Compacto (~236px),
 * pensado para vivir junto a `DayGrid` en la vista Día.
 */
export function AgendaSidePanel({
  month,
  selectedDate,
  datesWithAppointments,
  professionals,
  activeProfessionalIds,
  onToggleProfessional,
  onSelectDate,
  onChangeMonth,
}: AgendaSidePanelProps): React.ReactElement {
  const { year, month: monthNum } = parseMonthKey(month);
  const totalDays = daysInMonth(year, monthNum);
  const leadingBlanks = firstWeekday(year, monthNum);
  const label = monthLabel(year, monthNum);
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);
  const blanks = Array.from({ length: leadingBlanks }, (_, i) => i);

  return (
    <aside
      aria-label="Controles de la agenda"
      className="cristal-panel flex w-[236px] shrink-0 flex-col gap-4 rounded-xl p-3"
    >
      {/* Mini-calendario navegable */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold capitalize text-card-foreground">{label}</span>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md"
              onClick={() => onChangeMonth(-1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="sr-only">Mes anterior</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md"
              onClick={() => onChangeMonth(1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="sr-only">Mes siguiente</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((wd, i) => (
            <div
              key={`wd-${i}`}
              aria-hidden="true"
              className="pb-0.5 text-center text-[10px] font-medium text-muted-foreground/70"
            >
              {wd}
            </div>
          ))}
          {blanks.map((i) => (
            <div key={`blank-${i}`} aria-hidden="true" />
          ))}
          {dayNumbers.map((day) => {
            const dateStr = ymd(year, monthNum, day);
            const isSelected = dateStr === selectedDate;
            const hasAppointments = datesWithAppointments?.has(dateStr) ?? false;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onSelectDate(dateStr)}
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${day} de ${label}${hasAppointments ? ", con citas" : ""}`}
                className={cn(
                  "relative rounded-[7px] py-1 text-center text-xs font-medium transition-colors duration-150 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isSelected
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {day}
                {hasAppointments ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-primary",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtro de profesionales (multi-selección) */}
      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Profesionales
        </h3>
        {professionals.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Sin profesionales</p>
        ) : (
          <div className="flex flex-col gap-0.5" role="group" aria-label="Filtro de profesionales">
            {professionals.map((prof) => {
              const isActive = activeProfessionalIds.has(prof.id);
              return (
                <button
                  key={prof.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onToggleProfessional(prof.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ease-apple-out hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    !isActive && "opacity-50",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                    style={{ backgroundColor: prof.color ?? "hsl(var(--muted-foreground))" }}
                  />
                  <span className="flex-1 truncate text-sm font-medium text-card-foreground">
                    {prof.full_name}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 ease-apple-out",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input text-transparent",
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Leyenda de estados */}
      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Estados
        </h3>
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className={cn("h-2.5 w-2.5 shrink-0 rounded-full", appointmentStatusDot(status))}
              />
              <span className="truncate">{APPOINTMENT_STATUS_LABELS[status]}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
