// Horario de cocina (hora de Madrid):
//  - Lunes a jueves y domingos: la cocina cierra a las 23:30.
//  - Viernes y sábados: la cocina cierra a las 00:30 (de la madrugada siguiente).
// Cuando la cocina está cerrada NO se puede pedir comida que vaya a cocina;
// sí se pueden pedir bebidas y los 3 aperitivos que se sirven en barra/caja
// (aceitunas, cucurucho de patatas y gildas).

/** Partes de la fecha/hora actuales en Europe/Madrid. */
function madridParts(d = new Date()): { dow: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: map[wd] ?? 1, minutes: hh * 60 + mm };
}

/** ¿La cocina está abierta ahora mismo (hora de Madrid)? */
export function isCocinaOpen(d = new Date()): boolean {
  const { dow, minutes } = madridParts(d);

  // Madrugada (00:00–05:59): pertenece al servicio del día anterior.
  if (minutes < 6 * 60) {
    const prev = (dow + 6) % 7; // día anterior
    // Solo viernes y sábado alargan el servicio hasta las 00:30 del día siguiente.
    if (prev === 5 || prev === 6) return minutes < 30; // abierto hasta las 00:30
    return false; // el resto de noches ya cerró a las 23:30
  }

  // Día/tarde/noche:
  if (dow === 5 || dow === 6) return true; // viernes y sábado: abierto hasta 00:30 (madrugada)
  return minutes < 23 * 60 + 30; // resto de días: abierto hasta las 23:30
}

const BARRA_APERITIVOS = /aceituna|gilda|cucurucho/;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** ¿Es uno de los 3 aperitivos que se sirven en barra/caja (no van a cocina)? */
export function esAperitivoBarra(nombre: string): boolean {
  return BARRA_APERITIVOS.test(norm(nombre));
}
