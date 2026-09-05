// Traducción de los errores de negocio de la RPC `staff_award_visit` (Salón OS) a un
// mensaje claro para el staff. Módulo PURO y testeable: sin red, sin DOM.
//
// IMPORTANTE — el gating de add-ons vive EN LA RPC (server-side). Cuando el salón no
// tiene contratado el add-on de fidelización, `staff_award_visit` responde con el código
// `FEATURE_NOT_ENABLED`. Aquí SOLO se TRADUCE ese código a un texto legible; nunca se
// sortea ni se intenta acreditar la visita por otra vía.

export type AwardErrorCode =
  | 'FEATURE_NOT_ENABLED'
  | 'FORBIDDEN'
  | 'CUSTOMER_NOT_FOUND'
  | 'NO_LINES'
  | 'UNKNOWN';

export const AWARD_ERROR_MESSAGES: Record<AwardErrorCode, string> = {
  // Add-on no contratado por este salón: gating de Salón OS. Mensaje explícito para que
  // el equipo sepa que NO es un fallo suyo, sino una función no incluida en su plan.
  FEATURE_NOT_ENABLED: 'Esta peluquería no tiene contratado este servicio.',
  FORBIDDEN: 'No tienes permiso para acreditar visitas en este salón.',
  CUSTOMER_NOT_FOUND: 'No se ha encontrado el cliente. Vuelve a escanear su QR e inténtalo de nuevo.',
  NO_LINES: 'Añade al menos un servicio antes de acreditar la visita.',
  UNKNOWN: 'No se ha podido acreditar la visita. Vuelve a intentarlo.',
};

/**
 * Clasifica un error de `staff_award_visit` mirando el texto combinado que devuelve
 * Supabase (mensaje + código + detalle + hint, ya sea del PostgrestError o del JSON de
 * negocio). `FEATURE_NOT_ENABLED` se comprueba PRIMERO: es el gating del add-on y debe
 * ganar a cualquier otro código genérico que pudiera aparecer en el mismo mensaje.
 */
export function classifyAwardError(text: string | null | undefined): AwardErrorCode {
  const t = (text ?? '').toUpperCase();
  if (t.includes('FEATURE_NOT_ENABLED')) return 'FEATURE_NOT_ENABLED';
  if (t.includes('FORBIDDEN')) return 'FORBIDDEN';
  if (t.includes('CUSTOMER_NOT_FOUND')) return 'CUSTOMER_NOT_FOUND';
  if (t.includes('NO_LINES')) return 'NO_LINES';
  return 'UNKNOWN';
}

/** Atajo: del texto crudo del error al mensaje ya listo para pintar. */
export function messageForAwardError(text: string | null | undefined): string {
  return AWARD_ERROR_MESSAGES[classifyAwardError(text)];
}
