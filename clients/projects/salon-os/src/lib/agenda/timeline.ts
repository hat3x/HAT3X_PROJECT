/**
 * Eje de tiempo ELÁSTICO de la agenda (vista Día). Puro, sin IO.
 *
 * Cada franja del día se estira lo justo para que ninguna tarjeta quede por
 * debajo de su altura mínima legible (`minCard`, +`extra` si la cita lleva
 * nota). Como todas las columnas (profesionales) comparten el mismo eje, las
 * horas siguen alineadas entre columnas. Portado del mockup aprobado
 * (docs/superpowers/reference/2026-08-12-agenda-mockup.html).
 *
 * Minutos = enteros desde medianoche local (la zona horaria la resuelve el
 * llamador). No conoce React ni Supabase.
 */

export interface TimelineItem {
  startMin: number;
  durationMin: number;
  /** La cita necesita altura extra (p. ej. muestra una nota en la tarjeta). */
  needsExtra?: boolean;
}

export interface DayTimeline {
  /** Píxel del eje para un minuto dado (clampa a [dayStart, dayEnd]). */
  yAt(min: number): number;
  /** Minuto del día para un píxel dado (inversa de `yAt`). */
  minAt(y: number): number;
  /** Altura total del eje en píxeles. */
  total: number;
}

export interface DayTimelineOptions {
  dayStartMin: number;
  dayEndMin: number;
  /** Píxeles por minuto en la escala base (antes de estirar). */
  base: number;
  /** Altura mínima legible de una tarjeta, en píxeles. */
  minCard: number;
  /** Altura extra a reservar cuando la cita `needsExtra`. */
  extra: number;
  /** Marcas de rejilla (líneas de hora) a incluir como cortes, en minutos. Def. 60. */
  gridEveryMin?: number;
}

/** Redondea `min` al múltiplo de `step` más cercano. */
export function snapMinutes(min: number, step: number): number {
  return Math.round(min / step) * step;
}

export function buildDayTimeline(
  items: readonly TimelineItem[],
  opts: DayTimelineOptions,
): DayTimeline {
  const { dayStartMin: lo, dayEndMin: hi, base, minCard, extra } = opts;
  const grid = opts.gridEveryMin ?? 60;

  // Cortes: extremos del día + marcas de hora + inicios/fines de cada cita.
  const cuts = new Set<number>([lo, hi]);
  for (let t = Math.ceil(lo / grid) * grid; t < hi; t += grid) cuts.add(t);
  for (const it of items) {
    cuts.add(it.startMin);
    cuts.add(it.startMin + it.durationMin);
  }
  const B = [...cuts].filter((x) => x >= lo && x <= hi).sort((a, b) => a - b);

  // Altura de cada segmento: base * duración * factor de estiramiento.
  const segH: number[] = [];
  const Y: number[] = [0];
  for (let i = 0; i < B.length - 1; i += 1) {
    const b0 = B[i];
    const b1 = B[i + 1];
    if (b0 === undefined || b1 === undefined) continue;
    const ds = b1 - b0;
    let factor = 1;
    for (const it of items) {
      const s = it.startMin;
      const e = it.startMin + it.durationMin;
      if (s <= b0 && e >= b1) {
        const natural = it.durationMin * base;
        const required = minCard + (it.needsExtra ? extra : 0);
        if (natural > 0) factor = Math.max(factor, Math.max(natural, required) / natural);
      }
    }
    const h = ds * base * factor;
    segH.push(h);
    Y.push((Y[i] ?? 0) + h);
  }
  const total = Y[Y.length - 1] ?? 0;

  function yAt(min: number): number {
    const clamped = Math.max(lo, Math.min(hi, min));
    for (let i = 0; i < B.length - 1; i += 1) {
      const b0 = B[i];
      const b1 = B[i + 1];
      const y0 = Y[i];
      const sh = segH[i];
      if (b0 === undefined || b1 === undefined || y0 === undefined || sh === undefined) continue;
      if (clamped <= b1) {
        return y0 + ((clamped - b0) / (b1 - b0)) * sh;
      }
    }
    return total;
  }

  function minAt(y: number): number {
    const clamped = Math.max(0, Math.min(total, y));
    for (let i = 0; i < segH.length; i += 1) {
      const y0 = Y[i];
      const y1 = Y[i + 1];
      const b0 = B[i];
      const b1 = B[i + 1];
      const sh = segH[i];
      if (y0 === undefined || y1 === undefined || b0 === undefined || b1 === undefined || sh === undefined) {
        continue;
      }
      if (clamped <= y1) {
        const frac = sh > 0 ? (clamped - y0) / sh : 0;
        return b0 + frac * (b1 - b0);
      }
    }
    return hi;
  }

  return { yAt, minAt, total };
}
