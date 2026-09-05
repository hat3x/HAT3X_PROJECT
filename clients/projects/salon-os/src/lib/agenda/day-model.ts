import { formatSlotTime } from "@/lib/booking/format";
import type { TimelineItem } from "@/lib/agenda/timeline";

/** Minutos locales desde medianoche de un instante ISO, en la zona dada. */
export function agendaLocalMinutes(iso: string, timeZone: string): number {
  const hhmm = formatSlotTime(iso, timeZone); // "HH:MM" en hora local
  const parts = hhmm.split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  return h * 60 + m;
}

export interface OpeningRange {
  startMin: number;
  endMin: number;
}

export interface DayWindow {
  dayStartMin: number;
  dayEndMin: number;
  closed: OpeningRange[];
}

/**
 * Ventana del día para la parrilla: abarca la apertura y cualquier cita que se
 * salga, acotada por `fallback`. Las bandas de cierre son los huecos entre
 * rangos de apertura dentro de la ventana (p. ej. el descanso de mediodía).
 */
export function computeDayWindow(
  ranges: readonly OpeningRange[],
  items: readonly TimelineItem[],
  fallback: { startMin: number; endMin: number },
): DayWindow {
  const sorted = [...ranges].sort((a, b) => a.startMin - b.startMin);

  if (sorted.length === 0) {
    // Sin apertura: ventana = fallback ampliado por citas; sin cierres.
    let start = fallback.startMin;
    let end = fallback.endMin;
    for (const it of items) {
      start = Math.min(start, it.startMin);
      end = Math.max(end, it.startMin + it.durationMin);
    }
    return { dayStartMin: start, dayEndMin: end, closed: [] };
  }

  let start = sorted[0]?.startMin ?? fallback.startMin;
  let end = sorted[sorted.length - 1]?.endMin ?? fallback.endMin;
  for (const it of items) {
    start = Math.min(start, it.startMin);
    end = Math.max(end, it.startMin + it.durationMin);
  }

  const closed: OpeningRange[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (cur === undefined || next === undefined) continue;
    if (next.startMin > cur.endMin) {
      closed.push({ startMin: cur.endMin, endMin: next.startMin });
    }
  }

  return { dayStartMin: start, dayEndMin: end, closed };
}
