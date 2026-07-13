/**
 * Utilidades de zona horaria (IANA) sin dependencias externas.
 *
 * Las horas de trabajo y las citas se piensan en la hora local del salón
 * (`salons.timezone`), pero se almacenan como `timestamptz` (UTC). Estas
 * funciones convierten entre la hora de pared local del salón y el instante UTC
 * usando `Intl.DateTimeFormat`, respetando cambios de horario (DST).
 */

/**
 * Desfase, en milisegundos, de la zona respecto a UTC en un instante dado.
 * Positivo al este de Greenwich (p. ej. Europe/Madrid en verano → +7200000).
 */
function timeZoneOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };

  // Instante "como si los componentes locales fueran UTC".
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  return asUtc - instant.getTime();
}

/**
 * Convierte una hora de pared local del salón (fecha + hora en su zona) al
 * instante UTC correspondiente.
 *
 * @param dateStr  Fecha local `YYYY-MM-DD`.
 * @param timeStr  Hora local `HH:MM` o `HH:MM:SS`.
 * @param timeZone Zona IANA del salón (p. ej. `Europe/Madrid`).
 */
export function zonedWallTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateStr.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour = 0, minute = 0, second = 0] = timeStr.split(":").map(Number);

  // Primer intento: tratar la hora de pared como si fuera UTC.
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, second);

  // Corrección con el desfase real en ese instante. Una segunda iteración
  // estabiliza el resultado en los saltos de DST.
  let offset = timeZoneOffsetMs(timeZone, new Date(guessMs));
  let utcMs = guessMs - offset;
  offset = timeZoneOffsetMs(timeZone, new Date(utcMs));
  utcMs = guessMs - offset;

  return new Date(utcMs);
}

/**
 * Día de la semana (0=domingo … 6=sábado) de una fecha local `YYYY-MM-DD`,
 * interpretada como fecha de calendario (sin desplazamiento de zona).
 */
export function weekdayOfLocalDate(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Formatea un instante UTC (ISO) como hora local del salón `HH:MM`.
 */
export function formatTimeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Fecha local `YYYY-MM-DD` del salón para un instante UTC dado (o "ahora").
 */
export function localDateInZone(timeZone: string, instant: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA produce directamente YYYY-MM-DD.
  return dtf.format(instant);
}

/**
 * `true` si `timeZone` es una zona horaria IANA válida (p. ej. `Europe/Madrid`).
 *
 * Se apoya en `Intl`: construir un `DateTimeFormat` con una zona inválida lanza
 * `RangeError`. Sirve igual en el runtime de Node (Server Action) y en el
 * navegador, sin mantener a mano la lista completa de zonas.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.trim() === "") {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Zonas horarias ofrecidas en el selector de ajustes, priorizando España y el
 * entorno europeo del negocio. La lista es orientativa: el esquema valida
 * cualquier zona IANA válida, así que la zona actual del salón siempre puede
 * mostrarse aunque no figure aquí.
 */
export const COMMON_TIMEZONES: readonly string[] = [
  "Europe/Madrid",
  "Atlantic/Canary",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Dublin",
  "Europe/Andorra",
  "America/New_York",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "UTC",
] as const;
