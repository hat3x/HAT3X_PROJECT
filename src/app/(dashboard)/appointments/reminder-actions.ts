"use server";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { sendReminder24h, summarizeSendResult } from "@/lib/whatsapp/reminders";
import type { MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Roles con permiso para enviar recordatorios manuales. Sin gate de sector: aplica a todos. */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_ROLE = "No tienes permiso para enviar recordatorios.";
const ERROR_NO_PHONE = "El paciente no tiene teléfono para enviarle el recordatorio.";

interface AppointmentReminderRow {
  starts_at: string;
  price_cents: number;
  currency: string;
  customer: { full_name: string; phone: string | null } | null;
  professional: { full_name: string } | null;
  service: { name: string } | null;
  salon: { phone: string | null } | null;
}

/**
 * Envía al instante un recordatorio WhatsApp de la cita indicada, reutilizando
 * la MISMA plantilla y barreras de dry-run que el recordatorio automático de
 * 24h (`sendReminder24h`). Botón "Enviar recordatorio" de la cita.
 *
 * Gate de rol (owner/manager/staff), SIN gate de sector: vale para todos los
 * verticales. La cita se acota siempre al salón activo del usuario.
 */
export async function sendAppointmentReminder(
  appointmentId: string,
): Promise<ActionResult<{ message: string }>> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };

  const membership = await getActiveMembership();
  if (membership === null || !WRITE_ROLES.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "starts_at, price_cents, currency, customer:customers(full_name, phone), professional:professionals(full_name), service:services(name), salon:salons(phone)",
    )
    .eq("id", appointmentId)
    .eq("salon_id", salon.id)
    .single();

  if (error !== null) return { ok: false, error: error.message };

  const appointment = data as AppointmentReminderRow;
  const phone = appointment.customer?.phone ?? null;
  if (!phone) {
    return { ok: false, error: ERROR_NO_PHONE };
  }

  const result = await sendReminder24h({
    customerPhone: phone,
    customerName: appointment.customer?.full_name ?? "—",
    startsAt: appointment.starts_at,
    serviceName: appointment.service?.name ?? "—",
    professionalName: appointment.professional?.full_name ?? "—",
    salonName: salon.name,
    salonTimezone: salon.timezone,
    priceCents: appointment.price_cents,
    currency: appointment.currency,
    salonPhone: appointment.salon?.phone ?? undefined,
  });

  return { ok: true, data: { message: summarizeSendResult(result) } };
}
