/**
 * Edge Function: process-reminders
 *
 * Ejecutada cada 5 minutos por el cron (pg_cron + pg_net o Vercel Cron).
 *
 * FASE 1 — ENQUEUE (idempotente):
 *   - Detecta citas en ventana 24 h y 2 h → inserta filas pending en la cola.
 *   - Detecta citas recién completadas → inserta filas post_visita.
 *   - ON CONFLICT DO NOTHING: reentradas seguras.
 *
 * FASE 2 — PROCESS:
 *   - Lee hasta MAX_PROCESS_BATCH filas pending con scheduled_for <= now().
 *   - Marca cada fila como 'sending' (bloqueo optimista anti-duplicado).
 *   - Llama a Twilio; actualiza a 'sent' o 'failed'.
 *   - Reintentos: hasta max_attempts con backoff [1 min, 5 min, 15 min].
 *
 * Autenticación: cabecera x-cron-secret debe coincidir con env CRON_SECRET.
 * La función usa SUPABASE_SERVICE_ROLE_KEY → bypasa RLS.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  sendWhatsAppTemplate,
  getTwilioConfig,
  type TwilioConfig,
} from '../_shared/twilio-client.ts';

// ── Tuning constants ───────────────────────────────────────────────────────────

const MAX_PROCESS_BATCH = 25;
const MAX_RETRY_BATCH   = 10;

// Minutos de delay para reintento por número de intento (índice = attempt - 1)
const RETRY_DELAY_MINUTES = [1, 5, 15] as const;

// Ventanas de detección en minutos previos a starts_at
const WINDOW_24H_MIN = 23 * 60;     // 23 h
const WINDOW_24H_MAX = 25 * 60;     // 25 h
const WINDOW_2H_MIN  = 110;         // 1 h 50 min
const WINDOW_2H_MAX  = 130;         // 2 h 10 min

// Ventana de detección post_visita (minutos tras ends_at)
const POST_VISITA_DELAY_MIN  = 60;   // 1 h
const POST_VISITA_DETECT_MAX = 180;  // 3 h (ventana de búsqueda)

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppointmentDetails {
  id: string;
  salon_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  currency: string;
  customer_name: string;
  customer_phone: string | null;
  service_name: string;
  professional_name: string;
  salon_name: string;
  salon_timezone: string;
  salon_phone: string | null;
  salon_settings: Record<string, string> | null;
}

interface QueueRow {
  id: string;
  salon_id: string;
  appointment_id: string;
  reminder_type: string;
  customer_phone: string;
  attempts: number;
  max_attempts: number;
}

// ── Template variable builders ─────────────────────────────────────────────────

function formatDate(isoUtc: string, tz: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: tz,
  }).format(new Date(isoUtc));
}

function formatTime(isoUtc: string, tz: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit', minute: '2-digit',
    timeZone: tz,
  }).format(new Date(isoUtc));
}

function formatPrice(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency,
  }).format(cents / 100);
}

const REMINDER_TO_TEMPLATE: Record<string, string> = {
  confirmacion:     'confirmacionCita',
  recordatorio_24h: 'recordatorio24h',
  recordatorio_2h:  'recordatorio2h',
  post_visita:      'seguimientoPostVisita',
};

function buildVariables(
  reminderType: string,
  appt: AppointmentDetails,
): Record<string, string> {
  const tz   = appt.salon_timezone ?? 'Europe/Madrid';
  const date = formatDate(appt.starts_at, tz);
  const time = formatTime(appt.starts_at, tz);
  const settings = appt.salon_settings ?? {};

  switch (reminderType) {
    case 'confirmacion':
      return {
        '1': appt.customer_name,
        '2': appt.salon_name,
        '3': date,
        '4': time,
        '5': appt.service_name,
        '6': appt.professional_name,
        '7': formatPrice(appt.price_cents, appt.currency),
      };

    case 'recordatorio_24h':
      return {
        '1': appt.customer_name,
        '2': appt.salon_name,
        '3': date,
        '4': time,
        '5': appt.service_name,
        '6': appt.professional_name,
        '7': appt.salon_phone ?? appt.salon_name,
      };

    case 'recordatorio_2h':
      return {
        '1': appt.customer_name,
        '2': appt.salon_name,
        '3': time,
        '4': appt.service_name,
        '5': appt.professional_name,
      };

    case 'post_visita':
      return {
        '1': appt.customer_name,
        '2': appt.salon_name,
        '3': settings['reviewUrl'] ?? appt.salon_name,
      };

    default:
      return {};
  }
}

// ── Stats accumulator ──────────────────────────────────────────────────────────

type PhaseStats = {
  sent: number;
  failed: number;
  dryRun: number;
  skipped: number;
};

function emptyStats(): PhaseStats {
  return { sent: 0, failed: 0, dryRun: 0, skipped: 0 };
}

// ── Row processor ──────────────────────────────────────────────────────────────

async function processRow(
  row: QueueRow,
  supabase: ReturnType<typeof createClient>,
  twilioConfig: TwilioConfig,
  stats: PhaseStats,
): Promise<void> {
  // Optimistic lock: solo avanaza si el status es el esperado
  const lockStatus = row.attempts === 0 ? 'pending' : 'failed';
  const { error: lockErr } = await supabase
    .from('whatsapp_reminder_queue')
    .update({ status: 'sending' })
    .eq('id', row.id)
    .eq('status', lockStatus);

  if (lockErr) {
    // Otra invocación paralela lo tomó primero
    return;
  }

  // Cargar datos completos de la cita
  const { data: appt } = await supabase
    .rpc('get_appointment_details', { p_appointment_id: row.appointment_id }) as {
      data: AppointmentDetails | null;
    };

  if (!appt) {
    await supabase.from('whatsapp_reminder_queue').update({
      status:     'skipped',
      last_error: 'Cita eliminada o no encontrada',
      attempts:   row.attempts + 1,
    }).eq('id', row.id);
    stats.skipped++;
    return;
  }

  const templateKey = REMINDER_TO_TEMPLATE[row.reminder_type];
  if (!templateKey) {
    await supabase.from('whatsapp_reminder_queue').update({
      status:     'skipped',
      last_error: `reminder_type desconocido: ${row.reminder_type}`,
    }).eq('id', row.id);
    stats.skipped++;
    return;
  }

  const variables = buildVariables(row.reminder_type, appt);
  const result    = await sendWhatsAppTemplate(
    row.customer_phone,
    templateKey,
    variables,
    twilioConfig,
  );

  if (result.sent) {
    await supabase.from('whatsapp_reminder_queue').update({
      status:             'sent',
      sent_at:            new Date().toISOString(),
      twilio_message_sid: result.messageSid,
      attempts:           row.attempts + 1,
      last_error:         null,
      next_retry_at:      null,
    }).eq('id', row.id);
    stats.sent++;

  } else if (result.dryRun) {
    // Dry-run: marcar como enviado para no reintentarlo
    await supabase.from('whatsapp_reminder_queue').update({
      status:    'sent',
      sent_at:   new Date().toISOString(),
      last_error: `dry-run:${result.reason}`,
      attempts:   row.attempts + 1,
    }).eq('id', row.id);
    stats.dryRun++;

  } else {
    // Fallo real: programar reintento o marcar como agotado
    const nextAttempt = row.attempts + 1;
    const hasMoreRetries = nextAttempt < row.max_attempts;
    const delayIdx  = Math.min(row.attempts, RETRY_DELAY_MINUTES.length - 1);
    const nextRetry = hasMoreRetries
      ? new Date(Date.now() + RETRY_DELAY_MINUTES[delayIdx] * 60_000).toISOString()
      : null;

    await supabase.from('whatsapp_reminder_queue').update({
      status:        'failed',
      attempts:      nextAttempt,
      next_retry_at: nextRetry,
      last_error:    result.error,
    }).eq('id', row.id);
    stats.failed++;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── Validar secreto del cron ───────────────────────────────────────────────
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const incoming = req.headers.get('x-cron-secret');
    if (incoming !== cronSecret) {
      console.warn('[process-reminders] Unauthorized call — bad x-cron-secret');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const twilioConfig = getTwilioConfig();
  const now = new Date();

  const enqueueStats = { confirmacion: 0, recordatorio_24h: 0, recordatorio_2h: 0, post_visita: 0 };
  const processStats = emptyStats();
  const retryStats   = emptyStats();

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 1 — ENQUEUE
  // ════════════════════════════════════════════════════════════════════════════

  // 1a. recordatorio_24h
  {
    const { data: appts } = await supabase
      .rpc('get_appointments_for_reminder', {
        p_min_minutes: WINDOW_24H_MIN,
        p_max_minutes: WINDOW_24H_MAX,
      }) as { data: AppointmentDetails[] | null };

    for (const appt of appts ?? []) {
      const scheduledFor = new Date(appt.starts_at);
      scheduledFor.setTime(scheduledFor.getTime() - 24 * 60 * 60_000);

      await supabase.from('whatsapp_reminder_queue')
        .upsert({
          salon_id:       appt.salon_id,
          appointment_id: appt.id,
          reminder_type:  'recordatorio_24h',
          status:         'pending',
          scheduled_for:  scheduledFor.toISOString(),
          customer_phone: appt.customer_phone ?? '',
        }, { onConflict: 'appointment_id,reminder_type', ignoreDuplicates: true });

      enqueueStats.recordatorio_24h++;
    }
  }

  // 1b. recordatorio_2h
  {
    const { data: appts } = await supabase
      .rpc('get_appointments_for_reminder', {
        p_min_minutes: WINDOW_2H_MIN,
        p_max_minutes: WINDOW_2H_MAX,
      }) as { data: AppointmentDetails[] | null };

    for (const appt of appts ?? []) {
      const scheduledFor = new Date(appt.starts_at);
      scheduledFor.setTime(scheduledFor.getTime() - 2 * 60 * 60_000);

      await supabase.from('whatsapp_reminder_queue')
        .upsert({
          salon_id:       appt.salon_id,
          appointment_id: appt.id,
          reminder_type:  'recordatorio_2h',
          status:         'pending',
          scheduled_for:  scheduledFor.toISOString(),
          customer_phone: appt.customer_phone ?? '',
        }, { onConflict: 'appointment_id,reminder_type', ignoreDuplicates: true });

      enqueueStats.recordatorio_2h++;
    }
  }

  // 1c. post_visita (citas completadas entre 1 h y 3 h atrás)
  {
    const from = new Date(now.getTime() - POST_VISITA_DETECT_MAX * 60_000).toISOString();
    const to   = new Date(now.getTime() - POST_VISITA_DELAY_MIN  * 60_000).toISOString();

    const { data: completed } = await supabase
      .from('appointments')
      .select('id, salon_id, ends_at, customers!inner(phone)')
      .eq('status', 'completed')
      .gte('ends_at', from)
      .lte('ends_at', to) as {
        data: Array<{
          id: string;
          salon_id: string;
          ends_at: string;
          customers: { phone: string | null };
        }> | null;
      };

    for (const appt of completed ?? []) {
      const phone = appt.customers?.phone;
      if (!phone || !phone.trim()) continue;

      const scheduledFor = new Date(appt.ends_at);
      scheduledFor.setTime(scheduledFor.getTime() + POST_VISITA_DELAY_MIN * 60_000);

      await supabase.from('whatsapp_reminder_queue')
        .upsert({
          salon_id:       appt.salon_id,
          appointment_id: appt.id,
          reminder_type:  'post_visita',
          status:         'pending',
          scheduled_for:  scheduledFor.toISOString(),
          customer_phone: phone.trim(),
        }, { onConflict: 'appointment_id,reminder_type', ignoreDuplicates: true });

      enqueueStats.post_visita++;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 2 — PROCESS (pending listos para enviar)
  // ════════════════════════════════════════════════════════════════════════════

  const { data: pendingRows } = await supabase
    .from('whatsapp_reminder_queue')
    .select('id, salon_id, appointment_id, reminder_type, customer_phone, attempts, max_attempts')
    .eq('status', 'pending')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(MAX_PROCESS_BATCH) as { data: QueueRow[] | null };

  for (const row of pendingRows ?? []) {
    await processRow(row, supabase, twilioConfig, processStats);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 3 — RETRY (failed con reintentos pendientes)
  // ════════════════════════════════════════════════════════════════════════════

  const { data: retryRows } = await supabase
    .from('whatsapp_reminder_queue')
    .select('id, salon_id, appointment_id, reminder_type, customer_phone, attempts, max_attempts')
    .eq('status', 'failed')
    .lte('next_retry_at', now.toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(MAX_RETRY_BATCH) as { data: QueueRow[] | null };

  for (const row of (retryRows ?? []).filter(r => r.attempts < r.max_attempts)) {
    await processRow(row, supabase, twilioConfig, retryStats);
  }

  const result = { ok: true, enqueue: enqueueStats, process: processStats, retry: retryStats };
  console.log('[process-reminders] completed', JSON.stringify(result));

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});
