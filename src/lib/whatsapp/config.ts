/**
 * Configuración de la integración WhatsApp (Twilio).
 *
 * SOLO SERVIDOR — ninguna de estas variables lleva prefijo NEXT_PUBLIC_.
 * Las credenciales viven exclusivamente en variables de entorno; los valores
 * por defecto son placeholders que el cliente detecta para forzar dry-run.
 *
 * La integración está DESACTIVADA por defecto: mientras
 * WHATSAPP_REMINDERS_ENABLED !== 'true' o las credenciales sean placeholders,
 * ningún mensaje sale hacia Twilio.
 */

/** Placeholders reconocibles: si la config coincide, jamás se envía nada. */
export const TWILIO_PLACEHOLDERS = {
  accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authToken: 'your-twilio-auth-token',
  whatsappFrom: '+34600000000',
  contentSid: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
} as const;

export interface TwilioWhatsAppConfig {
  /** Kill-switch global. Solo 'true' literal activa el envío real. */
  enabled: boolean;
  accountSid: string;
  authToken: string;
  /** Número emisor en E.164, sin el prefijo `whatsapp:` (se añade al enviar). */
  whatsappFrom: string;
  /**
   * ContentSid de cada plantilla aprobada en Twilio Content Template Builder.
   * Hasta que exista aprobación real de Meta, quedan como placeholders.
   */
  contentSids: {
    recordatorio24h: string;
    recordatorio2h: string;
    confirmacionCita: string;
    citaCancelada: string;
    seguimientoPostVisita: string;
  };
  /** URL para callbacks de estado de entrega (opcional). */
  statusCallbackUrl: string | null;
}

export function getTwilioConfig(): TwilioWhatsAppConfig {
  return {
    enabled: process.env.WHATSAPP_REMINDERS_ENABLED === 'true',
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? TWILIO_PLACEHOLDERS.accountSid,
    authToken: process.env.TWILIO_AUTH_TOKEN ?? TWILIO_PLACEHOLDERS.authToken,
    whatsappFrom:
      process.env.TWILIO_WHATSAPP_FROM ?? TWILIO_PLACEHOLDERS.whatsappFrom,
    contentSids: {
      recordatorio24h:
        process.env.TWILIO_CONTENT_SID_RECORDATORIO_24H ??
        TWILIO_PLACEHOLDERS.contentSid,
      recordatorio2h:
        process.env.TWILIO_CONTENT_SID_RECORDATORIO_2H ??
        TWILIO_PLACEHOLDERS.contentSid,
      confirmacionCita:
        process.env.TWILIO_CONTENT_SID_CONFIRMACION ??
        TWILIO_PLACEHOLDERS.contentSid,
      citaCancelada:
        process.env.TWILIO_CONTENT_SID_CANCELACION ??
        TWILIO_PLACEHOLDERS.contentSid,
      seguimientoPostVisita:
        process.env.TWILIO_CONTENT_SID_SEGUIMIENTO ??
        TWILIO_PLACEHOLDERS.contentSid,
    },
    statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL ?? null,
  };
}

/**
 * true si alguna credencial sigue siendo un placeholder.
 * El cliente usa esto como segunda barrera además de `enabled`.
 */
export function hasPlaceholderCredentials(
  config: TwilioWhatsAppConfig
): boolean {
  return (
    config.accountSid === TWILIO_PLACEHOLDERS.accountSid ||
    !config.accountSid.startsWith('AC') ||
    config.authToken === TWILIO_PLACEHOLDERS.authToken ||
    config.whatsappFrom === TWILIO_PLACEHOLDERS.whatsappFrom
  );
}

/** Validación E.164 (obligatoria antes de cualquier envío). */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Normaliza teléfonos españoles guardados sin prefijo (formato habitual en
 * `customers.phone`) a E.164. Devuelve null si no es normalizable.
 */
export function normalizeToE164(
  phone: string,
  defaultCountry = '+34'
): string | null {
  const cleaned = phone.replace(/[\s().-]/g, '');
  if (isValidE164(cleaned)) return cleaned;
  if (/^00\d{6,15}$/.test(cleaned)) {
    const candidate = `+${cleaned.slice(2)}`;
    return isValidE164(candidate) ? candidate : null;
  }
  if (/^[679]\d{8}$/.test(cleaned)) return `${defaultCountry}${cleaned}`;
  return null;
}
