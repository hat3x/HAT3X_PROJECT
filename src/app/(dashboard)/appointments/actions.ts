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
  /**
   * Cliente EXISTENTE seleccionado en el buscador del formulario. Si viene, se
   * usa directamente (previa validación de tenant) y se ignora la búsqueda/alta
   * por email/teléfono. Si no viene, se busca o se crea a partir de `customer`.
   */
  customerId?: string;
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
 * BORRA (hard delete) una cita del salón activo. Irreversible: a diferencia de
 * cancelar —que conserva el registro en estado 'cancelled'—, elimina la fila.
 * Requiere rol de manager (política RLS `managers_delete_appointments`); los
 * bloques de ocupación asociados se eliminan en cascada. Útil para quitar citas
 * de prueba o canceladas que ya no interesan. Acotado por `salon_id`.
 */
export async function deleteAppointment(
  appointmentId: string,
): Promise<ActionResult<null>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appointmentId)
    .eq("salon_id", salonId);

  if (error !== null) {
    // 23503 = violación de FK: algo (p. ej. una venta de TPV) referencia la cita.
    if (error.code === "23503") {
      return {
        ok: false,
        error:
          "No se puede borrar: la cita tiene registros asociados (p. ej. una venta). Cancélala en su lugar.",
      };
    }
    return { ok: false, error: error.message };
  }

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

  let customerId: string;
  if (input.customerId) {
    // Cliente existente elegido en el buscador. Validar que pertenece al salón
    // activo antes de usarlo (defensa en profundidad sobre RLS).
    const { data: picked } = await supabase
      .from("customers")
      .select("id")
      .eq("salon_id", salonId)
      .eq("id", input.customerId)
      .maybeSingle();
    if (!picked) return { ok: false, error: "El cliente seleccionado no existe" };
    customerId = picked.id;
  } else {
    // Buscar cliente existente por email (preferido) o teléfono; si no, crearlo.
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
