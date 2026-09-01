// Horarios de servicio (hora de Madrid). Actualizado el 01/09/2026 por indicación del local.
//  - COCINA:  lunes a jueves y domingos cierra a las 22:30; viernes y sábados a las 23:30.
//  - BEBIDAS: lunes a jueves y domingos cierra a las 23:00; viernes y sábados a las 24:00.
// Cuando la cocina está cerrada NO se puede pedir comida que vaya a cocina; sí bebidas y los
// 3 aperitivos que se sirven en barra/caja (aceitunas, cucurucho de patatas y gildas).
// Cuando cierran las bebidas ya no se puede pedir NADA: es el cierre del local.
// Ojo: bebidas siempre cierra DESPUÉS que cocina, así que `!isBebidasOpen()` implica cerrado del todo.

/** Minuto del día (00:00 = 0) en que cierra cada servicio, por tipo de día. */
const CIERRE = {
  cocina: { entreSemana: 22 * 60 + 30, finde: 23 * 60 + 30 },
  bebidas: { entreSemana: 23 * 60, finde: 24 * 60 },
} as const;

/** Antes de esta hora es madrugada: el local está cerrado. */
const APERTURA = 6 * 60;

type Servicio = keyof typeof CIERRE;

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

/**
 * Bypass de PRUEBAS: añade ?cocina=1 o ?bebidas=1 a la URL para forzar ese servicio abierto y
 * poder pedir fuera de horario (tests desde la app). Inofensivo en producción: solo se activa
 * si se pone el parámetro a mano; para el cliente normal manda el horario.
 */
function bypassActivo(servicio: Servicio): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get(servicio) === '1';
  } catch {
    return false;
  }
}

function isServicioOpen(servicio: Servicio, d = new Date()): boolean {
  if (bypassActivo(servicio)) return true;
  const { dow, minutes } = madridParts(d);
  if (minutes < APERTURA) return false; // madrugada: ya cerró todo la noche anterior
  const finde = dow === 5 || dow === 6; // viernes y sábado
  return minutes < CIERRE[servicio][finde ? 'finde' : 'entreSemana'];
}

/** ¿La cocina está abierta ahora mismo (hora de Madrid)? */
export function isCocinaOpen(d = new Date()): boolean {
  return isServicioOpen('cocina', d);
}

/** ¿Se pueden pedir bebidas ahora mismo? Es también el cierre del local. */
export function isBebidasOpen(d = new Date()): boolean {
  return isServicioOpen('bebidas', d);
}

/** Aviso cuando el local ya ha cerrado (bebidas incluidas). */
export const MSG_LOCAL_CERRADO =
  'Ya hemos cerrado por hoy. ¡Te esperamos mañana! 🧡';

const BARRA_APERITIVOS = /aceituna|gilda|cucurucho/;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** ¿Es uno de los 3 aperitivos que se sirven en barra/caja (no van a cocina)? */
export function esAperitivoBarra(nombre: string): boolean {
  return BARRA_APERITIVOS.test(norm(nombre));
}
