/**
 * Orquestador de alto nivel para los recordatorios WhatsApp de cita.
 *
 * Transforma datos de dominio (cita, cliente, salón) en payloads de plantilla
 * y delega el envío al cliente Twilio. Todas las llamadas pasan por las
 * barreras de seguridad definidas en `client.ts` (dry-run por defecto).
 *
 * USO EXCLUSIVO DE SERVIDOR.
 */

import { formatLongDate, formatSlotTime, formatPrice } from '@/lib/booking/format';
import { sendWhatsAppTemplate, type SendResult } from '@/lib/whatsapp/client';
import {
  buildRecordatorio24hPayload,
  buildRecordatorio2hPayload,
  buildConfirmacionCitaPayload,
  buildCitaCanceladaPayload,
  buildSeguimientoPostVisitaPayload,
} from '@/lib/whatsapp/templates';

// ---------------------------------------------------------------------------
// Tipo de entrada compartido (subset de la cita + datos de contexto)
// ---------------------------------------------------------------------------

export interface AppointmentReminderInput {
  /** Teléfono del cliente en cualquier formato; se normaliza a E.164 internamente. */
  customerPhone: string;
  customerName: string;
  /** Instante de inicio de la cita en ISO UTC. */
  startsAt: string;
  serviceName: string;
  professionalName: string;
  salonName: string;
  /** Zona horaria IANA del salón, p. ej. "Europe/Madrid". */
  salonTimezone: string;
  /**
   * Precio en céntimos. Se formatea como moneda antes de enviarlo.
   * Opcional: si se omite no se incluye el precio en la plantilla.
   */
  priceCents?: number;
  currency?: string;
  /** Teléfono del salón para mensajes que lo incluyen. */
  salonPhone?: string;
  /** URL pública de reserva del salón (para mensajes de cancelación). */
  bookingUrl?: string;
  /** URL de reseña (para el seguimiento post-visita). */
  reviewUrl?: string;
}

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

function formatDate(startsAt: string, timezone: string): string {
  const dateStr = startsAt.slice(0, 10); // "YYYY-MM-DD"
  return formatLongDate(dateStr, timezone);
}

function formatTime(startsAt: string, timezone: string): string {
  return formatSlotTime(startsAt, timezone);
}

function formatPriceCents(cents: number, currency = 'EUR'): string {
  return formatPrice(cents, currency);
}

// ---------------------------------------------------------------------------
// Funciones públicas del orquestador
// ---------------------------------------------------------------------------

/** Recordatorio 24 horas antes de la cita. */
export async function sendReminder24h(
  input: AppointmentReminderInput,
): Promise<SendResult> {
  const payload = buildRecordatorio24hPayload({
    clientName: input.customerName,
    salonName: input.salonName,
    date: formatDate(input.startsAt, input.salonTimezone),
    time: formatTime(input.startsAt, input.salonTimezone),
    serviceName: input.serviceName,
    professionalName: input.professionalName,
    salonPhone: input.salonPhone ?? input.salonName,
  });

  return sendWhatsAppTemplate(input.customerPhone, payload);
}

/** Recordatorio 2 horas antes de la cita. */
export async function sendReminder2h(
  input: AppointmentReminderInput,
): Promise<SendResult> {
  const payload = buildRecordatorio2hPayload({
    clientName: input.customerName,
    salonName: input.salonName,
    time: formatTime(input.startsAt, input.salonTimezone),
    serviceName: input.serviceName,
    professionalName: input.professionalName,
  });

  return sendWhatsAppTemplate(input.customerPhone, payload);
}

/** Confirmación inmediata al crear la reserva. */
export async function sendBookingConfirmation(
  input: AppointmentReminderInput,
): Promise<SendResult> {
  const payload = buildConfirmacionCitaPayload({
    clientName: input.customerName,
    salonName: input.salonName,
    date: formatDate(input.startsAt, input.salonTimezone),
    time: formatTime(input.startsAt, input.salonTimezone),
    serviceName: input.serviceName,
    professionalName: input.professionalName,
    price:
      input.priceCents !== undefined
        ? formatPriceCents(input.priceCents, input.currency)
        : '—',
  });

  return sendWhatsAppTemplate(input.customerPhone, payload);
}

/** Notificación de cancelación de cita. */
export async function sendCancellationNotice(
  input: AppointmentReminderInput,
): Promise<SendResult> {
  const payload = buildCitaCanceladaPayload({
    clientName: input.customerName,
    salonName: input.salonName,
    date: formatDate(input.startsAt, input.salonTimezone),
    time: formatTime(input.startsAt, input.salonTimezone),
    bookingUrl: input.bookingUrl ?? input.salonName,
  });

  return sendWhatsAppTemplate(input.customerPhone, payload);
}

/** Seguimiento post-visita (solicitud de reseña). */
export async function sendPostVisitFollowUp(
  input: AppointmentReminderInput,
): Promise<SendResult> {
  const payload = buildSeguimientoPostVisitaPayload({
    clientName: input.customerName,
    salonName: input.salonName,
    reviewUrl: input.reviewUrl ?? input.salonName,
  });

  return sendWhatsAppTemplate(input.customerPhone, payload);
}

// ---------------------------------------------------------------------------
// Resultado resumido para logging / auditoría
// ---------------------------------------------------------------------------

export function summarizeSendResult(result: SendResult): string {
  if (result.sent) {
    return `✅ Enviado a ${result.to} (SID: ${result.messageSid})`;
  }
  if (result.dryRun) {
    return `⏭ Dry-run a ${result.to} [${result.reason}]`;
  }
  return `❌ Error enviando a ${result.to}: ${result.error}`;
}
