/**
 * Cliente HTTP para la API de Mensajes de Twilio (WhatsApp Business).
 *
 * SEGURIDAD / DRY-RUN:
 * Ningún mensaje sale si se cumple cualquiera de estas condiciones:
 *   1. `config.enabled !== true`  (kill-switch en WHATSAPP_REMINDERS_ENABLED)
 *   2. `hasPlaceholderCredentials(config)` (credenciales aún no reales)
 *   3. `toPhone` no pasa validación E.164
 *
 * En modo dry-run se devuelve `{ sent: false, dryRun: true }` y se loguea
 * el texto que se habría enviado; NUNCA se hace la llamada HTTP a Twilio.
 *
 * USO EXCLUSIVO DE SERVIDOR — no importar desde componentes cliente.
 */

import {
  getTwilioConfig,
  hasPlaceholderCredentials,
  isValidE164,
  normalizeToE164,
  type TwilioWhatsAppConfig,
} from '@/lib/whatsapp/config';
import type { TemplatePayload, TemplateKey } from '@/lib/whatsapp/templates';

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

export type SendResult =
  | { sent: true; dryRun: false; messageSid: string; to: string }
  | { sent: false; dryRun: true; reason: DryRunReason; to: string; logText: string }
  | { sent: false; dryRun: false; error: string; to: string };

export type DryRunReason =
  | 'disabled'           // WHATSAPP_REMINDERS_ENABLED !== 'true'
  | 'placeholder_creds'  // credenciales son placeholders
  | 'invalid_phone';     // número no normalizable a E.164

// ---------------------------------------------------------------------------
// Lógica central de envío
// ---------------------------------------------------------------------------

/**
 * Envía un mensaje WhatsApp usando la Content API de Twilio.
 *
 * @param toRaw       Teléfono del destinatario (E.164 o formato español sin prefijo)
 * @param payload     Payload de plantilla (key + variables + fallbackText para logs)
 * @param configOverride Opcional: config alternativa (útil en tests)
 */
export async function sendWhatsAppTemplate(
  toRaw: string,
  payload: TemplatePayload,
  configOverride?: TwilioWhatsAppConfig,
): Promise<SendResult> {
  const config = configOverride ?? getTwilioConfig();

  // ── Barrera 1: kill-switch ──────────────────────────────────────────────
  if (!config.enabled) {
    return dryRunResult('disabled', toRaw, payload.fallbackText);
  }

  // ── Barrera 2: credenciales placeholder ────────────────────────────────
  if (hasPlaceholderCredentials(config)) {
    return dryRunResult('placeholder_creds', toRaw, payload.fallbackText);
  }

  // ── Barrera 3: teléfono inválido ────────────────────────────────────────
  const to = normalizeToE164(toRaw);
  if (!to || !isValidE164(to)) {
    return dryRunResult('invalid_phone', toRaw, payload.fallbackText);
  }

  // ── Obtener ContentSid aprobado ─────────────────────────────────────────
  const contentSid = config.contentSids[payload.key as TemplateKey];
  if (!contentSid || contentSid.startsWith('HX0000')) {
    return {
      sent: false,
      dryRun: false,
      error: `ContentSid no configurado para la plantilla "${payload.key}".`,
      to,
    };
  }

  // ── Llamada HTTP a Twilio Messages API ──────────────────────────────────
  try {
    const result = await callTwilioApi(config, to, contentSid, payload.variables);
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

async function callTwilioApi(
  config: TwilioWhatsAppConfig,
  to: string,
  contentSid: string,
  variables: Record<string, string>,
): Promise<TwilioMessageResponse> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

  const body = new URLSearchParams({
    From: `whatsapp:${config.whatsappFrom}`,
    To: `whatsapp:${to}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
    ...(config.statusCallbackUrl ? { StatusCallback: config.statusCallbackUrl } : {}),
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
    body,
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
  reason: DryRunReason,
  toRaw: string,
  logText: string,
): SendResult {
  const label: Record<DryRunReason, string> = {
    disabled: '[DRY-RUN: recordatorios desactivados]',
    placeholder_creds: '[DRY-RUN: credenciales placeholder]',
    invalid_phone: '[DRY-RUN: teléfono inválido]',
  };

  console.log(
    `WhatsApp dry-run → to:${toRaw} reason:${reason}\n${label[reason]}\n${logText}`,
  );

  return { sent: false, dryRun: true, reason, to: toRaw, logText };
}
