/**
 * Motor de disponibilidad — lógica pura, sin Supabase ni React.
 *
 * Se comparte entre el Route Handler de reserva pública (servidor, service role)
 * y los hooks de la agenda del panel (cliente, RLS). Ambos cargan los mismos
 * datos y llaman a `generateSlots`, de modo que el cálculo es idéntico en los
 * dos flujos y fácil de testear de forma aislada.
 */
import { weekdayOfLocalDate, zonedWallTimeToUtc } from "@/lib/booking/timezone";

/** Tramo de horario recurrente relevante (hora local del salón). */
export interface ScheduleSlot {
  weekday: number;
  start_time: string; // "HH:MM:SS"
  end_time: string; // "HH:MM:SS"
}

/** Excepción puntual para una fecha concreta. */
export interface ExceptionSlot {
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
}

/** Cita existente (bloquea disponibilidad). Instantes UTC en ISO. */
export interface BusyInterval {
  starts_at: string;
  ends_at: string;
}

export interface GenerateSlotsInput {
  /** Fecha local del salón `YYYY-MM-DD`. */
  date: string;
  /** Zona IANA del salón. */
  timeZone: string;
  /** Duración del servicio en minutos. */
  serviceDurationMinutes: number;
  /** Horario recurrente del profesional (puede tener varios tramos/día). */
  schedules: ScheduleSlot[];
  /** Excepción de ese día, si existe. */
  exception?: ExceptionSlot | null;
  /** Citas activas del profesional ese día (UTC). */
  busy: BusyInterval[];
  /** Paso entre inicios de hueco, en minutos (por defecto 15). */
  slotIntervalMinutes?: number;
  /** Antelación mínima en minutos desde "ahora" (por defecto 0). */
  minLeadMinutes?: number;
  /** Instante de referencia (por defecto, ahora). Inyectable para test. */
  now?: Date;
}

/** Hueco disponible. */
export interface AvailableSlot {
  /** Inicio del hueco, instante UTC en ISO. */
  startsAt: string;
  /** Fin del hueco (inicio + duración), instante UTC en ISO. */
  endsAt: string;
}

const MINUTE_MS = 60_000;

/** Convierte "HH:MM[:SS]" a minutos desde medianoche. */
function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convierte minutos desde medianoche a "HH:MM". */
function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Genera los huecos reservables de un profesional para un día, respetando su
 * horario, las excepciones, las citas ya ocupadas y la antelación mínima.
 */
export function generateSlots(input: GenerateSlotsInput): AvailableSlot[] {
  const {
    date,
    timeZone,
    serviceDurationMinutes,
    schedules,
    exception = null,
    busy,
    slotIntervalMinutes = 15,
    minLeadMinutes = 0,
    now = new Date(),
  } = input;

  if (serviceDurationMinutes <= 0) return [];

  // 1. Determinar los tramos laborables del día (excepción tiene prioridad).
  let workingRanges: Array<{ start: number; end: number }>;

  if (exception) {
    if (!exception.is_available || !exception.start_time || !exception.end_time) {
      return []; // Día no laborable.
    }
    workingRanges = [
      {
        start: timeToMinutes(exception.start_time),
        end: timeToMinutes(exception.end_time),
      },
    ];
  } else {
    const weekday = weekdayOfLocalDate(date);
    workingRanges = schedules
      .filter((s) => s.weekday === weekday)
      .map((s) => ({
        start: timeToMinutes(s.start_time),
        end: timeToMinutes(s.end_time),
      }))
      .sort((a, b) => a.start - b.start);
  }

  if (workingRanges.length === 0) return [];

  // 2. Umbral de antelación mínima (instante UTC).
  const earliest = new Date(now.getTime() + minLeadMinutes * MINUTE_MS);

  // 3. Generar candidatos y filtrar solapes.
  const slots: AvailableSlot[] = [];

  for (const range of workingRanges) {
    // El último inicio posible deja sitio a la duración completa.
    const lastStart = range.end - serviceDurationMinutes;

    for (
      let startMin = range.start;
      startMin <= lastStart;
      startMin += slotIntervalMinutes
    ) {
      const startsAt = zonedWallTimeToUtc(date, minutesToTime(startMin), timeZone);
      const endsAt = new Date(startsAt.getTime() + serviceDurationMinutes * MINUTE_MS);

      // Descartar huecos pasados o sin la antelación mínima.
      if (startsAt < earliest) continue;

      // Descartar solapes con citas existentes.
      const overlaps = busy.some((b) => {
        const bStart = new Date(b.starts_at).getTime();
        const bEnd = new Date(b.ends_at).getTime();
        return startsAt.getTime() < bEnd && endsAt.getTime() > bStart;
      });
      if (overlaps) continue;

      slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    }
  }

  return slots;
}

/**
 * Combina los huecos de varios profesionales (opción "cualquier profesional"),
 * quedándose con un profesional disponible por instante de inicio.
 */
export function mergeSlotsByProfessional(
  perProfessional: Array<{ professionalId: string; slots: AvailableSlot[] }>,
): Array<AvailableSlot & { professionalId: string }> {
  const byStart = new Map<string, AvailableSlot & { professionalId: string }>();

  for (const { professionalId, slots } of perProfessional) {
    for (const slot of slots) {
      if (!byStart.has(slot.startsAt)) {
        byStart.set(slot.startsAt, { ...slot, professionalId });
      }
    }
  }

  return [...byStart.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
