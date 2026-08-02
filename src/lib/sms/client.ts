/**
 * Cliente HTTP para la API de Mensajes de Twilio (SMS de texto plano).
 *
 * Mismo mecanismo que ya usa la recepcionista de voz "Sara" para Biodental:
 * `From` = sender alfanumérico ES (p. ej. "Biodental"), `To` = E.164,
 * autenticación Basic con TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.
 *
 * SEGURIDAD / DRY-RUN:
 * Ningún SMS sale si se cumple cualquiera de estas condiciones:
 *   1. `config.enabled !== true`  (kill-switch en SMS_REMINDERS_ENABLED)
 *   2. `hasPlaceholderSmsCredentials(config)` (credenciales aún no reales)
 *   3. `toRaw` no normaliza a E.164 válido
 *
 * En modo dry-run se devuelve `{ sent: false, dryRun: true }` y se loguea
 * el texto que se habría enviado; NUNCA se hace la llamada HTTP a Twilio.
 *
 * USO EXCLUSIVO DE SERVIDOR — no importar desde componentes cliente.
 */

import {
  getSmsConfig,
  hasPlaceholderSmsCredentials,
  type TwilioSmsConfig,
} from '@/lib/sms/config';
import { isValidE164, normalizeToE164 } from '@/lib/whatsapp/config';

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

export type SmsSendResult =
  | { sent: true; dryRun: false; messageSid: string; to: string }
  | { sent: false; dryRun: true; reason: SmsDryRunReason; to: string; logText: string }
  | { sent: false; dryRun: false; error: string; to: string };

export type SmsDryRunReason =
  | 'disabled'           // SMS_REMINDERS_ENABLED !== 'true'
  | 'placeholder_creds'  // credenciales son placeholders
  | 'invalid_phone';     // número no normalizable a E.164

// ---------------------------------------------------------------------------
// Lógica central de envío
// ---------------------------------------------------------------------------

/**
 * Envía un SMS de texto plano usando la Messages API de Twilio.
 *
 * @param toRaw           Teléfono del destinatario (E.164 o formato español sin prefijo)
 * @param body            Texto plano del mensaje (ya interpolado)
 * @param configOverride  Opcional: config alternativa (útil en tests)
 */
export async function sendSms(
  toRaw: string,
  body: string,
  configOverride?: TwilioSmsConfig,
): Promise<SmsSendResult> {
  const config = configOverride ?? getSmsConfig();

  // ── Barrera 1: kill-switch ──────────────────────────────────────────────
  if (!config.enabled) {
    return dryRunResult('disabled', toRaw, body);
  }

  // ── Barrera 2: credenciales placeholder ────────────────────────────────
  if (hasPlaceholderSmsCredentials(config)) {
    return dryRunResult('placeholder_creds', toRaw, body);
  }

  // ── Barrera 3: teléfono inválido ────────────────────────────────────────
  const to = normalizeToE164(toRaw);
  if (!to || !isValidE164(to)) {
    return dryRunResult('invalid_phone', toRaw, body);
  }

  // ── Llamada HTTP a Twilio Messages API ──────────────────────────────────
  try {
    const result = await callTwilioSmsApi(config, to, body);
    return { sent: true, dryRun: false, messageSid: result.sid, to };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, dryRun: false, error: message, to };
  }
}

// ---------------------------------------------------------------------------
// HTTP helper — único punto de contacto con Twilio
// ---------------------------------------------------------------------------

interface TwilioMessageResponse {
  sid: string;
  status: string;
}

async function callTwilioSmsApi(
  config: TwilioSmsConfig,
  to: string,
  body: string,
): Promise<TwilioMessageResponse> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

  const params = new URLSearchParams({
    To: to,
    From: config.from,
    Body: body,
  });

  const credentials = Buffer.from(
    `${config.accountSid}:${config.authToken}`,
  ).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Twilio ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<TwilioMessageResponse>;
}

// ---------------------------------------------------------------------------
// Helper interno: construir resultado dry-run con log
// ---------------------------------------------------------------------------

function dryRunResult(
  reason: SmsDryRunReason,
  toRaw: string,
  logText: string,
): SmsSendResult {
  const label: Record<SmsDryRunReason, string> = {
    disabled: 'Modo prueba — recordatorios SMS desactivados',
    placeholder_creds: 'Modo prueba — credenciales de Twilio sin configurar',
    invalid_phone: 'Modo prueba — teléfono no válido',
  };

  console.log(
    `SMS dry-run → to:${toRaw} reason:${reason}\n${label[reason]}\n${logText}`,
  );

  return { sent: false, dryRun: true, reason, to: toRaw, logText };
}

// ---------------------------------------------------------------------------
// Resumen legible del resultado (para logging / auditoría / UI)
// ---------------------------------------------------------------------------

export function summarizeSmsResult(result: SmsSendResult): string {
  if (result.sent) {
    return "Enviado ✓";
  }
  if (result.dryRun) {
    if (result.reason === "invalid_phone") {
      return "No enviado — el paciente no tiene un teléfono válido";
    }
    return "Modo prueba — no enviado (envío de SMS desactivado)";
  }
  return `No se pudo enviar: ${result.error}`;
}
