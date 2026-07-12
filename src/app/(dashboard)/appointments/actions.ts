"use server";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type { AppointmentStatus } from "@/types/database";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface RescheduleAppointmentInput {
  appointmentId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
}

export interface CreateAppointmentInput {
  serviceId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  customer: {
    fullName: string;
    phone: string;
    email?: string;
    notes?: string;
  };
}

/**
 * Cambia el estado de una cita del salón activo.
 * Solo guarda `cancelled_reason` cuando el nuevo estado es 'cancelled'.
 */
export async function updateAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  cancelledReason?: string,
): Promise<ActionResult<null>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const update: Partial<{ status: AppointmentStatus; cancelled_reason: string }> = { status };
  if (status === "cancelled" && cancelledReason?.trim()) {
    update.cancelled_reason = cancelledReason.trim();
  }

  const { error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", appointmentId)
    .eq("salon_id", salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return { ok: true, data: null };
}

/**
 * Crea una cita desde el panel (estado inicial: confirmed).
 * Busca o crea el cliente por email/teléfono antes de insertar.
 */
export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<ActionResult<{ id: string }>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();

  const email = input.customer.email?.trim().toLowerCase() || null;
  const phone = input.customer.phone.trim();

  // Buscar cliente existente por email (preferido) o teléfono.
  let customerId: string;
  const existingQuery = email
    ? supabase
        .from("customers")
        .select("id")
        .eq("salon_id", salonId)
        .eq("email", email)
        .maybeSingle()
    : supabase
        .from("customers")
        .select("id")
        .eq("salon_id", salonId)
        .eq("phone", phone)
        .maybeSingle();

  const { data: existing } = await existingQuery;
  if (existing) {
    customerId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("customers")
      .insert({
        salon_id: salonId,
        full_name: input.customer.fullName.trim(),
        email,
        phone,
      })
      .select("id")
      .single();

    if (createErr !== null || !created) {
      return { ok: false, error: "No se pudo registrar el cliente" };
    }
    customerId = created.id;
  }

  // Snapshot de precio del servicio en el momento de la reserva.
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("price_cents, currency")
    .eq("id", input.serviceId)
    .eq("salon_id", salonId)
    .maybeSingle();

  if (svcErr !== null || !service) {
    return { ok: false, error: "Servicio no disponible" };
  }

  const { data: appointment, error: apptErr } = await supabase
    .from("appointments")
    .insert({
      salon_id: salonId,
      customer_id: customerId,
      professional_id: input.professionalId,
      service_id: input.serviceId,
      // Las citas creadas por el staff quedan confirmadas directamente.
      status: "confirmed",
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      price_cents: service.price_cents,
      currency: service.currency,
      notes: input.customer.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (apptErr !== null) {
    if (apptErr.code === "23P01") {
      return { ok: false, error: "Ese horario ya está ocupado. Elige otro." };
    }
    return { ok: false, error: apptErr.message };
  }

  revalidatePath("/appointments");
  revalidatePath("/customers");
  return { ok: true, data: { id: appointment.id } };
}

/**
 * Reprograma una cita activa (pending | confirmed): cambia fecha/hora y,
 * opcionalmente, profesional. El servicio y el cliente no cambian.
 * Si el nuevo horario solapa con otra cita, la DB devuelve 23P01.
 */
export async function rescheduleAppointment(
  input: RescheduleAppointmentInput,
): Promise<ActionResult<null>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();

  const { error } = await supabase
    .from("appointments")
    .update({
      professional_id: input.professionalId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    })
    .eq("id", input.appointmentId)
    .eq("salon_id", salonId)
    .in("status", ["pending", "confirmed"]);

  if (error !== null) {
    if (error.code === "23P01") {
      return { ok: false, error: "Ese horario ya está ocupado. Elige otro." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/appointments");
  return { ok: true, data: null };
}
