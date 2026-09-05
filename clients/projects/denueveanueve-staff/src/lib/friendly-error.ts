// Traduce CUALQUIER error de consulta (PostgrestError de Supabase, TypeError de red, Error
// genérico o un valor desconocido) a un mensaje BREVE y LEGIBLE en español para mostrar en la
// UI. Nunca expone el texto técnico crudo (SQL, inglés, «JWT expired», «permission denied for
// table…», mensajes de guardia internos): ese detalle es para los logs, no para la persona que
// usa el salón.
//
// Se usa en las pantallas de agenda/empleados para que un fallo de consulta muestre un aviso
// entendible con acción («reintentar»/«revisa tu conexión») en lugar de una jerga técnica o,
// peor, una pantalla en blanco.

/** Copias reconocibles y accionables por categoría de fallo. */
const OFFLINE = 'Parece que no hay conexión. Revisa tu internet y vuelve a intentarlo.';
const PERMISSION = 'No tienes permiso para ver esta información.';
const SESSION = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
/** Última red de seguridad si no hay `fallback` de pantalla ni categoría reconocida. */
const GENERIC = 'No se pudo completar la operación. Vuelve a intentarlo en unos segundos.';

export interface FriendlyErrorOptions {
  /**
   * Copia específica de la pantalla para el caso «no reconocido» (p. ej. «No se pudo cargar la
   * agenda. Vuelve a intentarlo.»). Debe ser legible: se muestra tal cual a la persona usuaria.
   */
  fallback?: string;
}

/** Vista de solo lectura de un error como objeto (Postgrest/HTTP/Error comparten forma laxa). */
function asRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
}

/** El navegador afirma que estamos sin conexión (lo más útil de reportar, sea cual sea el error). */
function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Devuelve un mensaje de error legible en español. El orden importa: primero lo más accionable
 * (sin conexión), luego sesión/permisos, y por último la copia de pantalla o la genérica. En
 * NINGÚN caso se devuelve el mensaje crudo del error.
 */
export function friendlyErrorMessage(error: unknown, options: FriendlyErrorOptions = {}): string {
  const fallback = options.fallback ?? GENERIC;

  // 1) Sin conexión declarada por el navegador.
  if (browserIsOffline()) return OFFLINE;

  const record = asRecord(error);
  const rawMessage = typeof record?.message === 'string' ? record.message : '';
  const code = typeof record?.code === 'string' ? record.code : '';
  const status = typeof record?.status === 'number' ? record.status : undefined;
  const haystack = rawMessage.toLowerCase();

  // 2) Fallo de red del `fetch` (TypeError del navegador, variantes por motor).
  if (
    haystack.includes('failed to fetch') ||
    haystack.includes('networkerror') ||
    haystack.includes('network request failed') ||
    haystack.includes('load failed')
  ) {
    return OFFLINE;
  }

  // 3) Sesión/token caducado (PostgREST usa PGRST301; HTTP 401).
  if (code === 'PGRST301' || status === 401 || haystack.includes('jwt expired')) {
    return SESSION;
  }

  // 4) Permisos / RLS de Postgres (SQLSTATE 42501) o HTTP 403.
  if (
    code === '42501' ||
    status === 403 ||
    haystack.includes('permission denied') ||
    haystack.includes('row-level security')
  ) {
    return PERMISSION;
  }

  // 5) Cualquier otro fallo: la copia legible de la pantalla (o la genérica). Nunca `rawMessage`.
  return fallback;
}
