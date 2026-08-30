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
  /**
   * Duración efectiva de bloqueo del profesional en minutos
   * (application_min + post_exposure_min del servicio).
   * Se usa para la ventana de solapamiento contra appointment_blocks.
   */
  serviceDurationMinutes: number;
  /**
   * Duración total de la cita en minutos
   * (application_min + exposure_min + post_exposure_min).
   * Se usa para `lastStart` (encaje en horario laboral) y `endsAt` del hueco.
   * Si se omite, iguala `serviceDurationMinutes` (comportamiento legacy).
   */
  appointmentDurationMinutes?: number;
  /** Horario recurrente del profesional (puede tener varios tramos/día). */
  schedules: ScheduleSlot[];
  /**
   * Horario de apertura de la CLÍNICA/salón (recurrente, hora local del salón).
   * Cuando se pasa, los tramos del profesional se INTERSECTAN con el horario del
   * salón: solo hay hueco si la clínica está abierta Y el profesional trabaja.
   *
   * Semántica de opcionalidad (retrocompatibilidad):
   * · `undefined` → el salón no usa horario de clínica; se ignora por completo y
   *   la disponibilidad es la del profesional (comportamiento previo).
   * · array (aunque esté vacío) → el salón SÍ define horario de clínica; un día sin
   *   tramos de salón significa CLÍNICA CERRADA ese día (no hay huecos).
   */
  salonSchedules?: ScheduleSlot[];
  /** Excepción de ese día, si existe. */
  exception?: ExceptionSlot | null;
  /** Bloques ocupados del profesional ese día (UTC). Fuente: appointment_blocks. */
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

/**
 * Motivo por el que un slot de la jornada NO es reservable (ver {@link DaySlot}).
 * · `past`     — su inicio ya quedó atrás (antes de "ahora" + antelación mínima).
 * · `occupied` — solapa un bloque físico del profesional (application/post de otra
 *                cita); la EXPOSICIÓN ajena NO cuenta, porque no genera bloque.
 * · `closed`   — la cita completa no cabe antes de que cierre el tramo laboral.
 */
export type DaySlotReason = "past" | "occupied" | "closed";

/**
 * Slot de la jornada laboral: TODOS los pasos de la agenda del profesional, no
 * solo los libres. Los `available: true` coinciden EXACTAMENTE con lo que
 * devuelve {@link generateSlots}; el resto llevan `reason` con el porqué.
 */
export interface DaySlot {
  /** Inicio del slot, instante UTC en ISO. */
  startsAt: string;
  /** Fin del slot (inicio + duración total de la cita), instante UTC en ISO. */
  endsAt: string;
  /** `true` si es reservable (equivale a que {@link generateSlots} lo incluiría). */
  available: boolean;
  /** Motivo de indisponibilidad; ausente cuando `available` es `true`. */
  reason?: DaySlotReason;
}

const MINUTE_MS = 60_000;

/** Convierte "HH:MM[:SS]" a minutos desde medianoche. */
function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convierte minutos desde medianoche a "HH:MM". */
export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Tramos laborables del día en minutos desde medianoche (hora local del salón),
 * ordenados por inicio. La excepción del día, si existe, tiene PRIORIDAD sobre el
 * horario recurrente. Devuelve `[]` si el día no es laborable.
 *
 * FUENTE ÚNICA de los tramos: la comparten `generateSlots` y `generateDaySlots`,
 * de modo que ambos parten exactamente de la misma jornada.
 */
/**
 * Intersección de dos conjuntos de rangos `[start, end)` (minutos). Como cada
 * lado no tiene solapes internos, las piezas resultantes tampoco solapan entre sí.
 * Devuelve solo los solapes con duración positiva, ordenados por inicio.
 */
function intersectRanges(
  a: Array<{ start: number; end: number }>,
  b: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const r1 of a) {
    for (const r2 of b) {
      const start = Math.max(r1.start, r2.start);
      const end = Math.min(r1.end, r2.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Excepción del horario de la CLÍNICA para una fecha concreta. */
export interface SalonOpeningException {
  exception_date: string;
  /** `false` = cerrado ese día. `true` = turno EXTRA con horas. */
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
}

/**
 * Los tramos en que la clínica está abierta una fecha concreta.
 *
 * Nace de un caso real: Nicolás pasa consulta un martes por la tarde, pero solo
 * ese martes. Meterlo en el horario semanal abriría la clínica todos los martes
 * del año. Y sin poder abrirlo, su turno desaparecía —el motor cruza
 * profesional ∩ clínica, y la clínica cerraba a las 14:00—.
 *
 * Dos reglas, y la segunda es la que da sentido a la palabra "extra":
 *
 *  · **Un cierre manda sobre todo.** Si ese día la clínica cierra, da igual el
 *    horario semanal y da igual que alguien hubiera apuntado un turno extra
 *    antes: cerrado es cerrado.
 *  · **Un turno extra SE SUMA al horario semanal**, no lo sustituye. Añadir una
 *    tarde no debería obligar a reescribir la mañana de siempre.
 */
export function resolveSalonRanges(
  date: string,
  weekly: readonly ScheduleSlot[],
  exceptions: readonly SalonOpeningException[],
): Array<{ start: number; end: number }> {
  const delDia = exceptions.filter((e) => e.exception_date === date);

  // El cierre se comprueba primero, y sobre TODAS las excepciones del día: si
  // hay un cierre, no hay nada que abrir.
  if (delDia.some((e) => !e.is_open)) return [];

  const weekday = weekdayOfLocalDate(date);
  const semanales = weekly
    .filter((s) => s.weekday === weekday)
    .map((s) => ({ start: timeToMinutes(s.start_time), end: timeToMinutes(s.end_time) }));

  const extra = delDia
    .filter((e) => e.start_time !== null && e.end_time !== null)
    .map((e) => ({
      start: timeToMinutes(e.start_time as string),
      end: timeToMinutes(e.end_time as string),
    }));

  // Ordenados: la rejilla de huecos se pinta en este orden.
  return [...semanales, ...extra].sort((a, b) => a.start - b.start);
}

function resolveWorkingRanges(
  date: string,
  schedules: ScheduleSlot[],
  exception: ExceptionSlot | null,
  salonSchedules?: ScheduleSlot[],
): Array<{ start: number; end: number }> {
  const weekday = weekdayOfLocalDate(date);

  // Tramos del PROFESIONAL: la excepción del día tiene prioridad sobre el horario
  // recurrente.
  let professionalRanges: Array<{ start: number; end: number }>;
  if (exception) {
    professionalRanges =
      !exception.is_available || !exception.start_time || !exception.end_time
        ? [] // Día no laborable para el profesional.
        : [
            {
              start: timeToMinutes(exception.start_time),
              end: timeToMinutes(exception.end_time),
            },
          ];
  } else {
    professionalRanges = schedules
      .filter((s) => s.weekday === weekday)
      .map((s) => ({
        start: timeToMinutes(s.start_time),
        end: timeToMinutes(s.end_time),
      }))
      .sort((a, b) => a.start - b.start);
  }

  // Sin horario de clínica configurado → disponibilidad del profesional a secas.
  if (salonSchedules === undefined) return professionalRanges;

  // Con horario de clínica: intersectar. La clínica debe estar abierta Y el
  // profesional debe trabajar. Un día sin tramos de salón = clínica cerrada.
  const salonRanges = salonSchedules
    .filter((s) => s.weekday === weekday)
    .map((s) => ({
      start: timeToMinutes(s.start_time),
      end: timeToMinutes(s.end_time),
    }))
    .sort((a, b) => a.start - b.start);

  return intersectRanges(professionalRanges, salonRanges);
}

/**
 * ¿La ventana de bloqueo `[startMs, checkEndMs)` de una cita candidata solapa
 * algún bloque ocupado del profesional? `busy` proviene de `appointment_blocks`,
 * que SOLO contiene las fases application y post_exposure (la exposición ajena no
 * genera bloque, por eso no aparece aquí y no bloquea).
 *
 * FUENTE ÚNICA de verdad del solape: la usan por igual `generateSlots` (solo-libres)
 * y `generateDaySlots` (jornada completa), así que el criterio no puede divergir.
 */
function overlapsBusy(
  startMs: number,
  checkEndMs: number,
  busy: BusyInterval[],
): boolean {
  return busy.some((b) => {
    const bStart = new Date(b.starts_at).getTime();
    const bEnd = new Date(b.ends_at).getTime();
    return startMs < bEnd && checkEndMs > bStart;
  });
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
    appointmentDurationMinutes,
    schedules,
    salonSchedules,
    exception = null,
    busy,
    slotIntervalMinutes = 15,
    minLeadMinutes = 0,
    now = new Date(),
  } = input;

  // totalDuration: duración completa de la cita (para encaje en horario y endsAt).
  // serviceDurationMinutes: ventana de bloqueo efectivo (para chequeo de solapamiento).
  const totalDuration = appointmentDurationMinutes ?? serviceDurationMinutes;

  if (serviceDurationMinutes <= 0) return [];

  // 1. Determinar los tramos laborables del día (excepción tiene prioridad; si el
  //    salón define horario de clínica, se intersecta con él).
  const workingRanges = resolveWorkingRanges(date, schedules, exception, salonSchedules);
  if (workingRanges.length === 0) return [];

  // 2. Umbral de antelación mínima (instante UTC).
  const earliest = new Date(now.getTime() + minLeadMinutes * MINUTE_MS);

  // 3. Generar candidatos y filtrar solapes.
  const slots: AvailableSlot[] = [];

  for (const range of workingRanges) {
    // El último inicio posible deja sitio a la duración total de la cita.
    const lastStart = range.end - totalDuration;

    for (
      let startMin = range.start;
      startMin <= lastStart;
      startMin += slotIntervalMinutes
    ) {
      const startsAt = zonedWallTimeToUtc(date, minutesToTime(startMin), timeZone);
      // endsAt refleja el fin real de la cita (duración total).
      const endsAt = new Date(startsAt.getTime() + totalDuration * MINUTE_MS);
      // checkEnd: ventana efectiva de bloqueo del profesional para detectar solapamiento.
      const checkEnd = new Date(startsAt.getTime() + serviceDurationMinutes * MINUTE_MS);

      // Descartar huecos pasados o sin la antelación mínima.
      if (startsAt < earliest) continue;

      // Descartar solapamiento con bloques ocupados de appointment_blocks.
      if (overlapsBusy(startsAt.getTime(), checkEnd.getTime(), busy)) continue;

      slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    }
  }

  return slots;
}

/**
 * Genera TODOS los slots de la jornada laboral del profesional en el paso de tiempo
 * actual (no solo los libres), etiquetando cada uno como reservable o no.
 *
 * Pensado para pintar la agenda del día: por cada posición del horario laboral
 * indica si es reservable (`available`) y, si no lo es, POR QUÉ (`reason`).
 *
 * INVARIANTE con {@link generateSlots}: un slot sale `available: true` EXACTAMENTE
 * cuando `generateSlots` lo incluiría — mismo motor de tramos ({@link resolveWorkingRanges}),
 * mismo umbral de antelación y misma comprobación de solape ({@link overlapsBusy})
 * contra los mismos `appointment_blocks`. No hay un segundo cálculo que pueda divergir.
 *
 * Modelo de 3 fases: como `busy` solo trae application/post, un slot que cae en la
 * EXPOSICIÓN de otra cita del profesional no solapa nada y sale `available: true`;
 * solo application/post cuentan como `occupied`.
 *
 * `reason` (solo si `available: false`), por precedencia: `past` → `occupied` → `closed`.
 * El tiempo manda primero (un inicio pasado nunca es reservable); entre los futuros,
 * se prioriza la ocupación real frente al residual de fin de jornada (`closed`).
 */
export function generateDaySlots(input: GenerateSlotsInput): DaySlot[] {
  const {
    date,
    timeZone,
    serviceDurationMinutes,
    appointmentDurationMinutes,
    schedules,
    salonSchedules,
    exception = null,
    busy,
    slotIntervalMinutes = 15,
    minLeadMinutes = 0,
    now = new Date(),
  } = input;

  const totalDuration = appointmentDurationMinutes ?? serviceDurationMinutes;

  if (serviceDurationMinutes <= 0) return [];

  const workingRanges = resolveWorkingRanges(date, schedules, exception, salonSchedules);
  if (workingRanges.length === 0) return [];

  const earliest = new Date(now.getTime() + minLeadMinutes * MINUTE_MS);

  const slots: DaySlot[] = [];

  for (const range of workingRanges) {
    // Último inicio que deja sitio a la cita completa (idéntico a generateSlots).
    const lastStart = range.end - totalDuration;

    // Recorremos TODAS las posiciones cuyo inicio cae dentro del tramo laboral,
    // no solo hasta `lastStart`: las que empiezan a tiempo pero no caben antes del
    // cierre se etiquetan `closed` en vez de desaparecer.
    for (
      let startMin = range.start;
      startMin < range.end;
      startMin += slotIntervalMinutes
    ) {
      const startsAt = zonedWallTimeToUtc(date, minutesToTime(startMin), timeZone);
      const endsAt = new Date(startsAt.getTime() + totalDuration * MINUTE_MS);
      const checkEnd = new Date(startsAt.getTime() + serviceDurationMinutes * MINUTE_MS);

      const fits = startMin <= lastStart;
      const isPast = startsAt < earliest;
      const occupied = overlapsBusy(startsAt.getTime(), checkEnd.getTime(), busy);

      const startsAtIso = startsAt.toISOString();
      const endsAtIso = endsAt.toISOString();

      // available: true SOLO si cabe, no es pasado y no está ocupado → mismo criterio
      // que generateSlots (que solo empuja huecos que cumplen las tres condiciones).
      if (fits && !isPast && !occupied) {
        slots.push({ startsAt: startsAtIso, endsAt: endsAtIso, available: true });
        continue;
      }

      // Precedencia del motivo: tiempo → ocupación real → residual de cierre.
      const reason: DaySlotReason = isPast ? "past" : occupied ? "occupied" : "closed";
      slots.push({ startsAt: startsAtIso, endsAt: endsAtIso, available: false, reason });
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
