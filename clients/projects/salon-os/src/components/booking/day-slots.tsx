"use client";

import { CalendarX, Clock, Moon, Sun, Sunrise } from "lucide-react";

import { formatSlotTime } from "@/lib/booking/format";
import type { PublicDaySlot, PublicSlot } from "@/lib/booking/types";
import { cn } from "@/lib/utils";

/**
 * Rejilla de horas de la jornada, COMPARTIDA por la reserva pública (asistente) y por
 * la creación de cita desde el panel, para que ambas pinten EXACTAMENTE la misma
 * cuadrícula y no diverjan. Opera sobre la vista `view=day` del endpoint de
 * disponibilidad ({@link PublicDaySlot}): TODOS los pasos del día, con `available` y su
 * `reason` cuando no lo son.
 *
 * Solo los huecos libres son botones reservables; los ocupados/pasados/cerrados van
 * atenuados, tachados y NO clicables. Por construcción, `onSelect` únicamente se dispara
 * para huecos `available`, así que cualquier consumidor sigue reservando solo horas
 * libres sin validación extra en el cliente.
 */

/** Icono por franja del día, para dar textura visual a los grupos de huecos. */
const SLOT_GROUP_ICON: Record<string, typeof Sunrise> = {
  Mañana: Sunrise,
  Tarde: Sun,
  Noche: Moon,
};

/**
 * Etiqueta de cada motivo por el que un hueco NO es reservable (rejilla `view=day`).
 * `word` es la palabra corta que lee el lector de pantalla en el `aria-label`
 * («11:00 — ocupado»); `hint` es el tooltip (`title`) al pasar el ratón.
 */
const SLOT_REASON: Record<
  NonNullable<PublicDaySlot["reason"]>,
  { word: string; hint: string }
> = {
  past: { word: "ya pasada", hint: "Esta hora ya ha pasado" },
  occupied: { word: "ocupado", hint: "Hora ya ocupada" },
  closed: { word: "cerrado", hint: "Fuera del horario de atención" },
};

/**
 * Agrupa los pasos de la jornada por franja del día en la zona del salón. Opera sobre
 * la rejilla COMPLETA ({@link PublicDaySlot}): incluye tanto libres como no reservables,
 * de modo que cada franja pinta su cuadrícula íntegra.
 */
function groupSlots(
  slots: PublicDaySlot[],
  timeZone: string,
): Array<{ label: string; slots: PublicDaySlot[] }> {
  const groups: Record<string, PublicDaySlot[]> = {
    Mañana: [],
    Tarde: [],
    Noche: [],
  };

  for (const slot of slots) {
    const hour = Number(formatSlotTime(slot.startsAt, timeZone).slice(0, 2));
    const key = hour < 13 ? "Mañana" : hour < 19 ? "Tarde" : "Noche";
    groups[key]?.push(slot);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, slots: list }));
}

/**
 * Rejilla de horas del día: pinta la jornada COMPLETA como cuadrícula.
 *
 *   · Sin pasos (jornada vacía) ⇒ empty state (día cerrado / sin horario, o —en la
 *     vista «cualquier profesional»— ningún hueco libre).
 *   · Con pasos ⇒ cuadrícula por franjas. Los libres son botones reservables; los no
 *     reservables van atenuados, tachados y no clicables, con el motivo en
 *     `aria-label`/`title`. Si NO queda ninguno libre, un aviso lo dice arriba y la
 *     rejilla (toda ocupada/pasada) queda de contexto.
 *
 * La cuadrícula vive en un contenedor con scroll para que una jornada larga no estire
 * la tarjeta; responsive (3 columnas en móvil, 4 desde `sm`).
 */
export function DaySlots({
  slots,
  timeZone,
  selected,
  anyProfessional,
  onSelect,
}: {
  slots: PublicDaySlot[];
  timeZone: string;
  selected: PublicSlot | null;
  /** `true` cuando la vista es «cualquier profesional» (solo llegan libres normalizados). */
  anyProfessional: boolean;
  onSelect: (slot: PublicSlot) => void;
}): React.ReactElement {
  if (slots.length === 0) {
    return (
      <SlotsEmptyState
        message={
          anyProfessional
            ? "No hay horas libres este día. Prueba con otra fecha."
            : "Este día no tiene horario de atención. Prueba con otra fecha."
        }
      />
    );
  }

  const hasUnavailable = slots.some((slot) => !slot.available);
  const noneFree = slots.every((slot) => !slot.available);

  return (
    <div className="space-y-3">
      {hasUnavailable && <SlotLegend />}

      {noneFree && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-warning/25 bg-warning/5 px-3.5 py-2.5 text-sm text-muted-foreground"
        >
          <CalendarX className="h-4 w-4 shrink-0 text-warning" />
          <span>
            No quedan horas libres este día. Prueba con{" "}
            <strong className="font-medium text-foreground">otra fecha</strong>.
          </span>
        </div>
      )}

      {/* Contenedor con scroll: acota la altura de jornadas largas. `px-1 -mx-1`
          deja aire para que el anillo de foco de los huecos no se recorte. */}
      <div className="-mx-1 max-h-[26rem] space-y-4 overflow-y-auto overscroll-contain px-1">
        {groupSlots(slots, timeZone).map((group) => {
          const GroupIcon = SLOT_GROUP_ICON[group.label] ?? Clock;
          const freeInGroup = group.slots.filter((s) => s.available).length;
          return (
            <div key={group.label} className="space-y-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <GroupIcon className="h-3.5 w-3.5" />
                {group.label}
                <span className="ml-auto font-normal normal-case tracking-normal text-muted-foreground/70">
                  {freeInGroup > 0
                    ? `${freeInGroup} ${freeInGroup === 1 ? "libre" : "libres"}`
                    : "Completo"}
                </span>
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {group.slots.map((daySlot) => (
                  <SlotCell
                    key={daySlot.startsAt}
                    slot={daySlot}
                    timeZone={timeZone}
                    selected={selected?.startsAt === daySlot.startsAt}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Leyenda compacta libre / no disponible (apoyo visual; el motivo exacto va por hueco). */
function SlotLegend(): React.ReactElement {
  return (
    <div
      aria-hidden
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
    >
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded-[5px] border border-border/70 bg-card shadow-xs" />
        Libre
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded-[5px] border border-dashed border-muted-foreground/30 bg-muted/60" />
        No disponible
      </span>
    </div>
  );
}

/**
 * Una celda de la rejilla. Libre ⇒ botón reservable (su nombre accesible es la hora
 * a secas, p. ej. «11:00»). No reservable ⇒ atenuado, tachado y NO clicable, con el
 * motivo en `aria-label` («11:00 — ocupado») y en `title` (tooltip).
 *
 * Se usa `aria-disabled` (no el `disabled` nativo) a propósito: un control nativo
 * deshabilitado no emite eventos de ratón, así que su `title` no aparecería; además,
 * `aria-disabled` deja que el lector de pantalla lo descubra y anuncie el motivo.
 * `tabIndex={-1}` y la ausencia de manejador lo dejan fuera del recorrido y sin acción.
 */
function SlotCell({
  slot,
  timeZone,
  selected,
  onSelect,
}: {
  slot: PublicDaySlot;
  timeZone: string;
  selected: boolean;
  onSelect: (slot: PublicSlot) => void;
}): React.ReactElement {
  const time = formatSlotTime(slot.startsAt, timeZone);

  if (slot.available) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        title={`Disponible · ${time}`}
        onClick={() =>
          onSelect({
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            professionalId: slot.professionalId,
          })
        }
        className={cn(
          "flex h-11 items-center justify-center rounded-lg border text-sm font-medium tabular-nums shadow-xs transition-all duration-200 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95",
          selected
            ? "border-primary bg-primary text-primary-foreground shadow-brand"
            : "border-border/70 bg-card hover:-translate-y-0.5 hover:border-primary hover:bg-accent hover:text-accent-foreground",
        )}
      >
        {time}
      </button>
    );
  }

  const reason = slot.reason ? SLOT_REASON[slot.reason] : SLOT_REASON.closed;
  return (
    <button
      type="button"
      aria-disabled
      tabIndex={-1}
      title={reason.hint}
      aria-label={`${time} — ${reason.word}`}
      className="flex h-11 cursor-not-allowed items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-muted/50 text-sm font-medium tabular-nums text-muted-foreground/45 line-through decoration-muted-foreground/40"
    >
      <span aria-hidden>{time}</span>
    </button>
  );
}

/**
 * Empty state de la rejilla (día sin horario, o sin libres en «cualquier profesional»).
 * Autónomo, para que la rejilla no dependa del asistente que la aloja.
 */
function SlotsEmptyState({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarX className="h-5 w-5" />
      </span>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** Esqueleto de carga para la rejilla de huecos (reutilizable por cualquier consumidor). */
export function DaySlotsSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4" aria-hidden>
      {[6, 8].map((count, groupIndex) => (
        <div key={groupIndex} className="space-y-2.5">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: count }).map((_, cellIndex) => (
              <div
                key={cellIndex}
                className="h-11 animate-pulse rounded-lg bg-muted"
                style={{ animationDelay: `${cellIndex * 60}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
