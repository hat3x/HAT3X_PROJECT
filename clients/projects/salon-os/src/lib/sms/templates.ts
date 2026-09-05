/**
 * Textos de los recordatorios SMS (texto plano, sin markdown, ≤ ~320 caracteres).
 *
 * A diferencia de las plantillas WhatsApp (`@/lib/whatsapp/templates`, que usan
 * ContentSids aprobados por Meta), el SMS no requiere plantilla pre-aprobada:
 * el cuerpo se interpola directamente y se envía tal cual a Twilio.
 */

export interface AppointmentReminderSmsVars {
  clientName: string;
  salonName: string;
  /** Fecha ya formateada en texto, p. ej. "martes, 14 de julio de 2026". */
  date: string;
  /** Hora ya formateada, p. ej. "10:30". */
  time: string;
  serviceName: string;
}

/** Recordatorio de cita (recordatorio 24h) en texto plano. */
export function buildAppointmentReminderSms(v: AppointmentReminderSmsVars): string {
  return (
    `Hola ${v.clientName}, te recordamos tu cita en ${v.salonName} el ${v.date} ` +
    `a las ${v.time} (${v.serviceName}). Si no puedes acudir, avísanos.`
  );
}

export interface RevisionReminderSmsVars {
  clientName: string;
  salonName: string;
}

/** Recordatorio de revisión (recall) en texto plano. */
export function buildRevisionReminderSms(v: RevisionReminderSmsVars): string {
  return (
    `Hola ${v.clientName}, hace un tiempo de tu última visita a ${v.salonName}. ` +
    `¿Reservamos tu revisión? Llámanos.`
  );
}
