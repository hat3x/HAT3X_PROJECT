/**
 * Cliente Twilio WhatsApp para Deno (Supabase Edge Functions).
 *
 * Reproduce las mismas barreras de dry-run que src/lib/whatsapp/client.ts:
 *   1. Kill-switch (WHATSAPP_REMINDERS_ENABLED !== 'true')
 *   2. Detección de credenciales placeholder
 *   3. Validación de teléfono E.164
 *
 * Fichero exclusivo de Deno. Usa btoa() en lugar de Buffer de Node.
 */

// ── Placeholders ───────────────────────────────────────────────────────────────

export const PLACEHOLDER_ACCOUNT_SID  = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
export const PLACEHOLDER_AUTH_TOKEN   = 'your-twilio-auth-token';
export const PLACEHOLDER_FROM         = '+34600000000';
export const PLACEHOLDER_CONTENT_SID  = 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface TwilioConfig {
  enabled: boolean;
  accountSid: string;
  authToken: string;
  whatsappFrom: string;
  contentSids: Record<string, string>;
  statusCallbackUrl: string | null;
}

export function getTwilioConfig(): TwilioConfig {
  return {
    enabled:      Deno.env.get('WHATSAPP_REMINDERS_ENABLED') === 'true',
    accountSid:   Deno.env.get('TWILIO_ACCOUNT_SID')   ?? PLACEHOLDER_ACCOUNT_SID,
    authToken:    Deno.env.get('TWILIO_AUTH_TOKEN')    ?? PLACEHOLDER_AUTH_TOKEN,
    whatsappFrom: Deno.env.get('TWILIO_WHATSAPP_FROM') ?? PLACEHOLDER_FROM,
    contentSids: {
      recordatorio24h:       Deno.env.get('TWILIO_CONTENT_SID_RECORDATORIO_24H') ?? PLACEHOLDER_CONTENT_SID,
      recordatorio2h:        Deno.env.get('TWILIO_CONTENT_SID_RECORDATORIO_2H')  ?? PLACEHOLDER_CONTENT_SID,
      confirmacionCita:      Deno.env.get('TWILIO_CONTENT_SID_CONFIRMACION')      ?? PLACEHOLDER_CONTENT_SID,
      citaCancelada:         Deno.env.get('TWILIO_CONTENT_SID_CANCELACION')       ?? PLACEHOLDER_CONTENT_SID,
      seguimientoPostVisita: Deno.env.get('TWILIO_CONTENT_SID_SEGUIMIENTO')       ?? PLACEHOLDER_CONTENT_SID,
    },
    statusCallbackUrl: Deno.env.get('TWILIO_STATUS_CALLBACK_URL') ?? null,
  };
}

export function hasPlaceholderCredentials(cfg: TwilioConfig): boolean {
  return (
    cfg.accountSid   === PLACEHOLDER_ACCOUNT_SID ||
    !cfg.accountSid.startsWith('AC') ||
    cfg.authToken    === PLACEHOLDER_AUTH_TOKEN  ||
    cfg.whatsappFrom === PLACEHOLDER_FROM
  );
}

// ── Phone validation ───────────────────────────────────────────────────────────

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

export function normalizeToE164(
  phone: string,
  defaultCountry = '+34',
): string | null {
  const cleaned = phone.replace(/[\s().\-]/g, '');
  if (isValidE164(cleaned)) return cleaned;
  if (/^00\d{6,15}$/.test(cleaned)) {
    const candidate = `+${cleaned.slice(2)}`;
    return isValidE164(candidate) ? candidate : null;
  }
  if (/^[679]\d{8}$/.test(cleaned)) return `${defaultCountry}${cleaned}`;
  return null;
}

// ── Result types ───────────────────────────────────────────────────────────────

export type DryRunReason = 'disabled' | 'placeholder_creds' | 'invalid_phone';

export type SendResult =
  | { sent: true;  dryRun: false; messageSid: string; to: string }
  | { sent: false; dryRun: true;  reason: DryRunReason; to: string }
  | { sent: false; dryRun: false; error: string; to: string };

// ── Main send function ─────────────────────────────────────────────────────────

export async function sendWhatsAppTemplate(
  toRaw: string,
  templateKey: string,
  variables: Record<string, string>,
  cfg?: TwilioConfig,
): Promise<SendResult> {
  const config = cfg ?? getTwilioConfig();

  if (!config.enabled) {
    console.log(`[dry-run] disabled → to:${toRaw} key:${templateKey}`);
    return { sent: false, dryRun: true, reason: 'disabled', to: toRaw };
  }

  if (hasPlaceholderCredentials(config)) {
    console.log(`[dry-run] placeholder_creds → to:${toRaw} key:${templateKey}`);
    return { sent: false, dryRun: true, reason: 'placeholder_creds', to: toRaw };
  }

  const to = normalizeToE164(toRaw);
  if (!to || !isValidE164(to)) {
    console.warn(`[dry-run] invalid_phone → raw:${toRaw}`);
    return { sent: false, dryRun: true, reason: 'invalid_phone', to: toRaw };
  }

  const contentSid = config.contentSids[templateKey];
  if (!contentSid || contentSid === PLACEHOLDER_CONTENT_SID) {
    return {
      sent: false, dryRun: false,
      error: `ContentSid no configurado para la plantilla "${templateKey}".`,
      to,
    };
  }

  try {
    const sid = await callTwilioMessages(config, to, contentSid, variables);
    return { sent: true, dryRun: false, messageSid: sid, to };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, dryRun: false, error: message, to };
  }
}

// ── Twilio Messages API ────────────────────────────────────────────────────────

async function callTwilioMessages(
  cfg: TwilioConfig,
  to: string,
  contentSid: string,
  variables: Record<string, string>,
): Promise<string> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;

  const params = new URLSearchParams({
    From:             `whatsapp:${cfg.whatsappFrom}`,
    To:               `whatsapp:${to}`,
    ContentSid:       contentSid,
    ContentVariables: JSON.stringify(variables),
  });
  if (cfg.statusCallbackUrl) {
    params.set('StatusCallback', cfg.statusCallbackUrl);
  }

  const credentials = btoa(`${cfg.accountSid}:${cfg.authToken}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twilio ${response.status}: ${body}`);
  }

  const json = await response.json() as { sid: string };
  return json.sid;
}
