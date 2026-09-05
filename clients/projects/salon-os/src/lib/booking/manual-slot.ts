import { zonedWallTimeToUtc } from "@/lib/booking/timezone";
import type { PublicSlot } from "@/lib/booking/types";

/**
 * Un hueco puesto a mano: la hora y la duración que decida quien atiende.
 *
 * Nadia (Biodental) lo pidió así: poder dar la cita "a la hora que quiera" y
 * "como si hago una revisión de dos minutos". La rejilla del motor —cada 15
 * minutos y con la duración que dicta el servicio— va bien para el caso normal,
 * pero le impedía las dos cosas, y una clínica no siempre trabaja en múltiplos
 * de cuarto de hora.
 *
 * Esto se salta la rejilla, NO las reglas que importan: el solape lo sigue
 * impidiendo la base de datos, que es donde debe estar. Lo que se conserva aquí
 * son las dos condiciones sin las cuales el hueco no significa nada:
 *
 *  · **Profesional concreto.** "Cualquiera" solo tiene sentido cuando el motor
 *    busca por ti; si la hora la pones tú, alguien tiene que tenerla libre y
 *    hay que nombrarlo.
 *  · **Duración con sentido.** Al menos un minuto —una cita de cero no ocupa
 *    nada y ensucia la agenda— y como mucho una jornada, para que un dedo de
 *    más en el teclado no bloquee la agenda de una semana.
 */

/** Tope de una jornada larga. Por encima, es un error de tecleo. */
const MAX_DURACION_MIN = 12 * 60;

export interface ManualSlotInput {
  /** Fecha local `YYYY-MM-DD`. */
  date: string;
  /** Hora local `HH:MM`. */
  time: string;
  durationMin: number;
  timeZone: string;
  /** Debe ser un profesional concreto, no `"any"`. */
  professionalId: string;
}

export type ManualSlotResult =
  | { ok: true; slot: PublicSlot }
  | { ok: false; error: string };

export function buildManualSlot(input: ManualSlotInput): ManualSlotResult {
  const { date, time, durationMin, timeZone, professionalId } = input;

  if (professionalId === "" || professionalId === "any") {
    return { ok: false, error: "Elige con qué profesional es la cita." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Elige una fecha." };
  }
  // Se valida el rango además del formato: "25:00" encaja en un patrón laxo y
  // produciría una cita al día siguiente sin que nadie lo pidiera.
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (m === null) {
    return { ok: false, error: "Escribe la hora como HH:MM." };
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    return { ok: false, error: "Esa hora no existe." };
  }
  if (!Number.isFinite(durationMin) || durationMin < 1) {
    return { ok: false, error: "La cita tiene que durar al menos un minuto." };
  }
  if (durationMin > MAX_DURACION_MIN) {
    return { ok: false, error: "Esa duración es demasiado larga para una cita." };
  }

  // `zonedWallTimeToUtc` resuelve el desfase de la fecha concreta: un desfase
  // fijo dejaría las citas corridas una hora media parte del año.
  const start = zonedWallTimeToUtc(date, `${String(h).padStart(2, "0")}:${m[2]}`, timeZone);
  const end = new Date(start.getTime() + Math.round(durationMin) * 60_000);

  return {
    ok: true,
    slot: { startsAt: start.toISOString(), endsAt: end.toISOString(), professionalId },
  };
}
