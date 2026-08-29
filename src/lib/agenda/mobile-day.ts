/**
 * El día de la agenda, convertido en lista para el móvil.
 *
 * En pantalla estrecha la parrilla por profesional no funciona, y no es cosa de
 * afinar unos píxeles: una rejilla de N columnas necesita ~200 px por columna,
 * así que en 360 px no entran ni dos; y como la altura de la tarjeta la marca
 * la duración, una cita de 15 minutos mide 20 px y no cabe el nombre de quien
 * viene. De ahí las capturas con columnas cortadas a media palabra y citas
 * convertidas en manchas de color sin texto.
 *
 * La lista cambia la pregunta que responde la pantalla. La parrilla responde
 * "¿qué huecos quedan?"; la lista responde "¿qué toca ahora?", que es lo que se
 * mira desde el móvil, de pie y con el teléfono en una mano.
 *
 * De regalo desaparece el cálculo de carriles (`lanes.ts`): dos citas a la vez
 * son dos filas, no dos tarjetas peleándose por el ancho.
 */
import { agendaLocalMinutes } from "@/lib/agenda/day-model";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";

/** Una cita ya situada en el día, con lo que la fila necesita pintar. */
export interface MobileAgendaEntry {
  appointment: AppointmentWithDetails;
  /** Minutos desde medianoche, hora local del salón. */
  startMin: number;
  endMin: number;
  durationMin: number;
}

/** Las citas que empiezan dentro de una misma hora. */
export interface MobileAgendaGroup {
  /** Minuto local de la franja, siempre múltiplo de 60 (10:00 → 600). */
  hourMin: number;
  entries: MobileAgendaEntry[];
}

/**
 * Agrupa las citas del día por su hora de INICIO y las ordena cronológicamente.
 *
 * Se agrupa por el inicio y no por el tramo ocupado a propósito: una cita de
 * 90 minutos que empieza a las 10:30 es "la de las diez y media". Repetirla en
 * las franjas de 11 y 12 llenaría la lista de citas que no existen y haría
 * imposible contar el día de un vistazo.
 *
 * Las canceladas se conservan: quien mira el día necesita ver que ese hueco se
 * liberó. Es la vista quien las distingue visualmente, no este cálculo.
 */
export function buildMobileAgenda(
  appointments: readonly AppointmentWithDetails[],
  timeZone: string,
): MobileAgendaGroup[] {
  const entries: MobileAgendaEntry[] = appointments.map((appointment) => {
    const startMin = agendaLocalMinutes(appointment.starts_at, timeZone);
    const endMin = agendaLocalMinutes(appointment.ends_at, timeZone);
    // Una cita que cruza la medianoche daría un fin menor que su inicio. Es
    // rarísimo en un salón, pero una duración negativa pintaría "-1380 min".
    const durationMin = endMin >= startMin ? endMin - startMin : endMin + 24 * 60 - startMin;
    return { appointment, startMin, endMin, durationMin };
  });

  entries.sort((a, b) => a.startMin - b.startMin);

  const groups: MobileAgendaGroup[] = [];
  for (const entry of entries) {
    const hourMin = Math.floor(entry.startMin / 60) * 60;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.hourMin === hourMin) {
      last.entries.push(entry);
    } else {
      groups.push({ hourMin, entries: [entry] });
    }
  }
  return groups;
}

/** `600` → `"10:00"`. Para las cabeceras de franja de la lista. */
export function formatHourLabel(hourMin: number): string {
  const h = Math.floor(hourMin / 60);
  const m = hourMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
