/**
 * Plantillas de mensajes WhatsApp para recordatorios de cita.
 *
 * Cada plantilla tiene dos representaciones:
 *  - `contentSidKey`  → clave para localizar el ContentSid aprobado en Twilio.
 *  - `buildVariables` → construye el mapa de variables que se pasa al Content API.
 *  - `buildFallbackText` → texto libre para dry-run / logs (nunca se envía en prod).
 *
 * Las variables numeradas ({{1}}, {{2}}…) coinciden exactamente con el orden
 * declarado en el Content Template Builder de Twilio. Cambiar el orden aquí
 * SIN actualizar la plantilla aprobada en Meta romperá los mensajes.
 */

export type TemplateKey =
  | 'recordatorio24h'
  | 'recordatorio2h'
  | 'confirmacionCita'
  | 'citaCancelada'
  | 'seguimientoPostVisita'
  | 'recordatorioRevision';

// ---------------------------------------------------------------------------
// Interfaces de variables por plantilla
// ---------------------------------------------------------------------------

export interface Recordatorio24hVars {
  clientName: string;
  salonName: string;
  date: string;           // "martes, 14 de julio de 2026"
  time: string;           // "10:30"
  serviceName: string;
  professionalName: string;
  salonPhone: string;
}

export interface Recordatorio2hVars {
  clientName: string;
  salonName: string;
  time: string;
  serviceName: string;
  professionalName: string;
}

export interface ConfirmacionCitaVars {
  clientName: string;
  salonName: string;
  date: string;
  time: string;
  serviceName: string;
  professionalName: string;
  price: string;          // "25,00 €"
}

export interface CitaCanceladaVars {
  clientName: string;
  salonName: string;
  date: string;
  time: string;
  bookingUrl: string;     // URL pública de reserva del salón
}

export interface SeguimientoPostVisitaVars {
  clientName: string;
  salonName: string;
  reviewUrl: string;      // URL de Google Maps / plataforma de reseña
}

export interface RecordatorioRevisionVars {
  clientName: string;
  salonName: string;
  /** Meses transcurridos desde la última visita; si se omite, frase genérica. */
  months?: number;
  bookingUrl: string;     // URL pública de reserva del salón
}

// ---------------------------------------------------------------------------
// Cuerpos canónicos para registro en Twilio Content Template Builder y Meta
// (variables sin sustituir, tal cual se suben a la plataforma)
// ---------------------------------------------------------------------------

/**
 * Texto de cada plantilla con placeholders {{N}}.
 * Cópialo al crear/actualizar las plantillas en el Twilio Content Template Builder.
 */
export const TEMPLATE_BODIES: Record<TemplateKey, string> = {
  recordatorio24h:
    'Hola {{1}}, te recordamos que mañana tienes cita en {{2}} 📅\n\n' +
    '📅 {{3}} a las {{4}}\n' +
    '💇 {{5}}\n' +
    '👤 Con {{6}}\n\n' +
    'Si necesitas cambiarla, llámanos al {{7}}.\n' +
    '¡Te esperamos! 😊',

  recordatorio2h:
    'Hola {{1}}, en 2 horas tienes tu cita en {{2}} ⏰\n\n' +
    '⏰ Hoy a las {{3}}\n' +
    '💇 {{4}}\n' +
    '👤 Con {{5}}\n\n' +
    '¡Te esperamos! 😊',

  confirmacionCita:
    '✅ ¡Cita confirmada, {{1}}!\n\n' +
    'Hemos reservado tu cita en {{2}}:\n' +
    '📅 {{3}} a las {{4}}\n' +
    '💇 {{5}}\n' +
    '👤 Con {{6}}\n' +
    '💶 {{7}}\n\n' +
    'Para cancelar o modificar, contacta con nosotros.\n' +
    '¡Hasta pronto! 💇‍♀️',

  citaCancelada:
    'Hola {{1}}, tu cita en {{2}} del {{3}} a las {{4}} ha sido cancelada.\n\n' +
    'Si deseas reagendar puedes reservar en:\n' +
    '👉 {{5}}\n\n' +
    '¡Esperamos verte pronto! 🌟',

  seguimientoPostVisita:
    '¡Hola {{1}}! 😊\n\n' +
    'Gracias por tu visita a {{2}}. Esperamos que hayas quedado encantada con el resultado.\n\n' +
    '⭐ Tu opinión nos ayuda a mejorar:\n' +
    '👉 {{3}}\n\n' +
    '¡Hasta la próxima! 💫',

  recordatorioRevision:
    'Hola {{1}}, {{2}} de tu última visita a {{3}} 👋\n\n' +
    '¿Reservamos tu próxima revisión?\n' +
    '👉 {{4}}\n\n' +
    '¡Te esperamos pronto! 😊',
};

// ---------------------------------------------------------------------------
// Builders de variables: tipado fuerte → Record<string, string> para Twilio
// ---------------------------------------------------------------------------

function buildRecordatorio24hVars(v: Recordatorio24hVars): Record<string, string> {
  return {
    '1': v.clientName,
    '2': v.salonName,
    '3': v.date,
    '4': v.time,
    '5': v.serviceName,
    '6': v.professionalName,
    '7': v.salonPhone,
  };
}

function buildRecordatorio2hVars(v: Recordatorio2hVars): Record<string, string> {
  return {
    '1': v.clientName,
    '2': v.salonName,
    '3': v.time,
    '4': v.serviceName,
    '5': v.professionalName,
  };
}

function buildConfirmacionCitaVars(v: ConfirmacionCitaVars): Record<string, string> {
  return {
    '1': v.clientName,
    '2': v.salonName,
    '3': v.date,
    '4': v.time,
    '5': v.serviceName,
    '6': v.professionalName,
    '7': v.price,
  };
}

function buildCitaCanceladaVars(v: CitaCanceladaVars): Record<string, string> {
  return {
    '1': v.clientName,
    '2': v.salonName,
    '3': v.date,
    '4': v.time,
    '5': v.bookingUrl,
  };
}

function buildSeguimientoPostVisitaVars(
  v: SeguimientoPostVisitaVars,
): Record<string, string> {
  return {
    '1': v.clientName,
    '2': v.salonName,
    '3': v.reviewUrl,
  };
}

/** Frase genérica ("ha pasado un tiempo") o específica ("han pasado 6 meses"). */
function recencyPhrase(months: number | undefined): string {
  if (months === undefined) return 'ha pasado un tiempo';
  return `han pasado ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

function buildRecordatorioRevisionVars(v: RecordatorioRevisionVars): Record<string, string> {
  return {
    '1': v.clientName,
    '2': recencyPhrase(v.months),
    '3': v.salonName,
    '4': v.bookingUrl,
  };
}

// ---------------------------------------------------------------------------
// Builders de texto interpolado (para dry-run y logging)
// ---------------------------------------------------------------------------

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [k, v]) => text.replaceAll(`{{${k}}}`, v),
    template,
  );
}

export function buildRecordatorio24hText(v: Recordatorio24hVars): string {
  return interpolate(TEMPLATE_BODIES.recordatorio24h, buildRecordatorio24hVars(v));
}

export function buildRecordatorio2hText(v: Recordatorio2hVars): string {
  return interpolate(TEMPLATE_BODIES.recordatorio2h, buildRecordatorio2hVars(v));
}

export function buildConfirmacionCitaText(v: ConfirmacionCitaVars): string {
  return interpolate(TEMPLATE_BODIES.confirmacionCita, buildConfirmacionCitaVars(v));
}

export function buildCitaCanceladaText(v: CitaCanceladaVars): string {
  return interpolate(TEMPLATE_BODIES.citaCancelada, buildCitaCanceladaVars(v));
}

export function buildSeguimientoPostVisitaText(v: SeguimientoPostVisitaVars): string {
  return interpolate(
    TEMPLATE_BODIES.seguimientoPostVisita,
    buildSeguimientoPostVisitaVars(v),
  );
}

export function buildRecordatorioRevisionText(v: RecordatorioRevisionVars): string {
  return interpolate(
    TEMPLATE_BODIES.recordatorioRevision,
    buildRecordatorioRevisionVars(v),
  );
}

// ---------------------------------------------------------------------------
// Tipo unificado: payload listo para el cliente Twilio
// ---------------------------------------------------------------------------

export interface TemplatePayload {
  key: TemplateKey;
  /** Variables numeradas para el Content API de Twilio. */
  variables: Record<string, string>;
  /** Texto plano con variables sustituidas; solo para dry-run y logs. */
  fallbackText: string;
}

export function buildRecordatorio24hPayload(v: Recordatorio24hVars): TemplatePayload {
  return {
    key: 'recordatorio24h',
    variables: buildRecordatorio24hVars(v),
    fallbackText: buildRecordatorio24hText(v),
  };
}

export function buildRecordatorio2hPayload(v: Recordatorio2hVars): TemplatePayload {
  return {
    key: 'recordatorio2h',
    variables: buildRecordatorio2hVars(v),
    fallbackText: buildRecordatorio2hText(v),
  };
}

export function buildConfirmacionCitaPayload(v: ConfirmacionCitaVars): TemplatePayload {
  return {
    key: 'confirmacionCita',
    variables: buildConfirmacionCitaVars(v),
    fallbackText: buildConfirmacionCitaText(v),
  };
}

export function buildCitaCanceladaPayload(v: CitaCanceladaVars): TemplatePayload {
  return {
    key: 'citaCancelada',
    variables: buildCitaCanceladaVars(v),
    fallbackText: buildCitaCanceladaText(v),
  };
}

export function buildSeguimientoPostVisitaPayload(
  v: SeguimientoPostVisitaVars,
): TemplatePayload {
  return {
    key: 'seguimientoPostVisita',
    variables: buildSeguimientoPostVisitaVars(v),
    fallbackText: buildSeguimientoPostVisitaText(v),
  };
}

export function buildRecordatorioRevisionPayload(
  v: RecordatorioRevisionVars,
): TemplatePayload {
  return {
    key: 'recordatorioRevision',
    variables: buildRecordatorioRevisionVars(v),
    fallbackText: buildRecordatorioRevisionText(v),
  };
}
