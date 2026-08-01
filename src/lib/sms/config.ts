/**
 * Configuración de la integración SMS (Twilio Messages API).
 *
 * Recordatorios de cita para clientes que NO tienen WhatsApp configurado
 * (p. ej. Biodental, que ya usa SMS con sender alfanumérico "Biodental" desde
 * la recepcionista de voz "Sara"). Replica el mismo patrón de seguridad que
 * `@/lib/whatsapp/config`: dry-run por defecto hasta que haya credenciales
 * reales y el kill-switch esté activo.
 *
 * SOLO SERVIDOR — ninguna de estas variables lleva prefijo NEXT_PUBLIC_.
 *
 * La integración está DESACTIVADA por defecto: mientras
 * SMS_REMINDERS_ENABLED !== 'true' o las credenciales sean placeholders,
 * ningún SMS sale hacia Twilio.
 */

import { TWILIO_PLACEHOLDERS } from '@/lib/whatsapp/config';

/** Placeholders reconocibles: si la config coincide, jamás se envía nada. */
export const SMS_PLACEHOLDERS = {
  accountSid: TWILIO_PLACEHOLDERS.accountSid,
  authToken: TWILIO_PLACEHOLDERS.authToken,
} as const;

export interface TwilioSmsConfig {
  /** Kill-switch global. Solo 'true' literal activa el envío real. */
  enabled: boolean;
  accountSid: string;
  authToken: string;
  /**
   * Remitente del SMS: sender alfanumérico aprobado en Twilio para España
   * (≤ 11 caracteres, p. ej. "Biodental") o un número E.164.
   */
  from: string;
}

export function getSmsConfig(): TwilioSmsConfig {
  return {
    enabled: process.env.SMS_REMINDERS_ENABLED === 'true',
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? SMS_PLACEHOLDERS.accountSid,
    authToken: process.env.TWILIO_AUTH_TOKEN ?? SMS_PLACEHOLDERS.authToken,
    from: process.env.TWILIO_SMS_FROM ?? 'Biodental',
  };
}

/**
 * true si alguna credencial sigue siendo un placeholder.
 * El cliente usa esto como segunda barrera además de `enabled`.
 */
export function hasPlaceholderSmsCredentials(config: TwilioSmsConfig): boolean {
  return (
    config.accountSid === SMS_PLACEHOLDERS.accountSid ||
    !config.accountSid.startsWith('AC') ||
    config.authToken === SMS_PLACEHOLDERS.authToken
  );
}
