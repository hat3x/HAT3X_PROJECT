"use server";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { sendSms, summarizeSmsResult } from "@/lib/sms/client";
import { buildRevisionReminderSms } from "@/lib/sms/templates";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Roles con permiso para enviar recordatorios de revisión. Sin gate de sector. */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_ROLE = "No tienes permiso para enviar recordatorios.";
const ERROR_NO_PHONE = "El paciente no tiene teléfono para enviarle el recordatorio.";

/**
 * Envía un recordatorio de revisión (recall) por SMS a un cliente que hace
 * tiempo que no viene, reutilizando `sendSms` (mismas barreras de dry-run que
 * el resto de recordatorios). SMS en vez de WhatsApp: ver `reminder-actions.ts`.
 *
 * Gate de rol (owner/manager/staff), SIN gate de sector.
 */
export async function sendRecallReminder(
  customerId: string,
): Promise<ActionResult<{ message: string }>> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };

  const membership = await getActiveMembership();
  if (membership === null || !WRITE_ROLES.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }

  const supabase = createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("full_name, phone")
    .eq("id", customerId)
    .eq("salon_id", salon.id)
    .single();

  if (error !== null) return { ok: false, error: error.message };

  if (!customer.phone) {
    return { ok: false, error: ERROR_NO_PHONE };
  }

  const body = buildRevisionReminderSms({
    clientName: customer.full_name,
    salonName: salon.name,
  });

  const result = await sendSms(customer.phone, body);

  return { ok: true, data: { message: summarizeSmsResult(result) } };
}
