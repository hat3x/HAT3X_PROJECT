/**
 * Formateadores de dominio para agenda y reserva (precio, duración, fechas).
 */

/** Nombres de día de la semana (0=domingo … 6=sábado), en español. */
export const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

/** Precio en céntimos → cadena localizada, p. ej. 2500 EUR → "25,00 €". */
export function formatPrice(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Duración en minutos → "45 min" o "1 h 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Fecha local `YYYY-MM-DD` → texto largo en la zona del salón. */
export function formatLongDate(dateStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  // Mediodía UTC evita que el desplazamiento de zona cambie el día mostrado.
  const instant = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(instant);
}

/** Instante UTC (ISO) → "HH:MM" en la zona del salón. */
export function formatSlotTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Instante UTC (ISO) → "dd/MM HH:MM" en la zona del salón. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    hourCycle: "h23",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
