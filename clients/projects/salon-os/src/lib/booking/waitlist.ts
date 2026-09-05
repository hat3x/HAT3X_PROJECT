import { formatTimeInZone, localDateInZone, weekdayOfLocalDate } from "@/lib/booking/timezone";

/**
 * Lista de espera — a quién llamar cuando queda un hueco libre (B3).
 *
 * El problema que resuelve: hoy, cuando cancelan la cita de las nueve, nadie
 * sabe a quién llamar y el hueco se pierde. Un sillón parado una hora es dinero
 * que no vuelve, y el paciente que llevaba tres semanas esperando tampoco se
 * entera de que había sitio.
 *
 * Lógica PURA: recibe el hueco y la lista, y devuelve a quién llamar y en qué
 * orden. Ni Supabase ni WhatsApp — eso va fuera, y así esto se prueba entero.
 */

/** Una persona apuntada a la lista, con lo que aceptaría. */
export interface WaitlistCandidate {
  id: string;
  customerId: string;
  /** Servicio que espera. `null` = le vale cualquiera. */
  serviceId: string | null;
  /** Profesional que pidió. `null` = le da igual quién. */
  professionalId: string | null;
  /** Días que le vienen bien (0=domingo … 6=sábado). Vacío = cualquiera. */
  weekdays: number[];
  /** Franja que le viene bien, hora local del salón. `null` = sin límite. */
  fromTime: string | null;
  toTime: string | null;
  /** Mayor = antes. La clínica lo sube en urgencias o tratamientos en curso. */
  priority: number;
  /** Cuándo se apuntó (ISO). Desempata a igualdad de prioridad. */
  createdAt: string;
  /** Hasta cuándo tiene sentido llamarle (ISO). `null` = sin caducidad. */
  expiresAt: string | null;
}

/** El hueco que acaba de quedar libre. */
export interface FreedSlot {
  startsAt: string;
  endsAt: string;
  timeZone: string;
  serviceId: string;
  professionalId: string;
}

/** "HH:MM" a minutos desde medianoche. */
function toMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * ¿Le encaja este hueco a esta persona?
 *
 * Los `null` significan "me da igual", no "sin datos": quien no puso profesional
 * es porque acepta a cualquiera, y filtrar por él sería inventarse una
 * restricción que nadie pidió.
 */
function fits(slot: FreedSlot, candidate: WaitlistCandidate, now: Date): boolean {
  if (candidate.expiresAt !== null && new Date(candidate.expiresAt) <= now) return false;

  if (candidate.serviceId !== null && candidate.serviceId !== slot.serviceId) return false;
  if (candidate.professionalId !== null && candidate.professionalId !== slot.professionalId) {
    return false;
  }

  // Día y hora se miran en la zona del salón: el paciente dijo "los lunes por la
  // mañana", no "a las 08:00 UTC".
  const localDate = localDateInZone(slot.timeZone, new Date(slot.startsAt));
  if (candidate.weekdays.length > 0) {
    if (!candidate.weekdays.includes(weekdayOfLocalDate(localDate))) return false;
  }

  const startMin = toMinutes(formatTimeInZone(slot.startsAt, slot.timeZone));
  const endMin = toMinutes(formatTimeInZone(slot.endsAt, slot.timeZone));

  if (candidate.fromTime !== null && startMin < toMinutes(candidate.fromTime)) return false;
  // La cita ENTERA tiene que caber: quien puede hasta las 14:00 no puede irse a
  // la mitad de una cita que acaba a las 14:30, y llamarle es hacerle perder el
  // viaje.
  if (candidate.toTime !== null && endMin > toMinutes(candidate.toTime)) return false;

  return true;
}

/**
 * A quién llamar por este hueco, en orden.
 *
 * Primero la prioridad —la clínica la sube en urgencias o en tratamientos ya
 * empezados— y, a igualdad, quien lleva más tiempo esperando. Ese desempate no
 * es un detalle: sin él el orden lo decidiría el azar del array, y a quien lleva
 * tres semanas apuntado eso se le nota.
 */
export function matchWaitlist(
  slot: FreedSlot,
  candidates: readonly WaitlistCandidate[],
  now: Date,
): WaitlistCandidate[] {
  return candidates
    .filter((candidate) => fits(slot, candidate, now))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}
