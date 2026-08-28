"use server";

/**
 * Server actions de LISTA DE ESPERA (B3).
 *
 * Dos decisiones de alcance, distintas de las del expediente clínico:
 *
 *  · **Sin gate de sector.** Un hueco que se pierde se pierde igual en una
 *    peluquería que en una clínica, y la tabla no tiene nada dental. Limitarlo a
 *    odontología sería regalar la función al resto de sectores por descuido.
 *  · **Cualquier miembro, `staff` incluido.** Apuntar a alguien es operativa de
 *    mostrador: exigir owner/manager obligaría a molestar a la dueña cada vez
 *    que un paciente dice "avísame si sale algo".
 *
 * Sigue habiendo gate de salón y todo va acotado por `salon_id`, además de RLS.
 */
import { revalidatePath } from "next/cache";

import { getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { waitlistEntrySchema, waitlistStatusSchema } from "@/lib/validations/waitlist";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";

async function requireSalonId(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };
  return { ok: true, salonId: salon.id };
}

/** Apunta a una persona a la lista de espera del salón activo. */
export async function addToWaitlist(input: unknown): Promise<ActionResult<{ id: string }>> {
  const access = await requireSalonId();
  if (!access.ok) return { ok: false, error: access.error };

  const parsed = waitlistEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("waitlist_entry")
    .insert({
      salon_id: access.salonId,
      customer_id: parsed.data.customerId,
      service_id: parsed.data.serviceId ?? null,
      professional_id: parsed.data.professionalId ?? null,
      weekdays: parsed.data.weekdays,
      from_time: parsed.data.fromTime ?? null,
      to_time: parsed.data.toTime ?? null,
      priority: parsed.data.priority,
      notes: parsed.data.notes ?? null,
      expires_at: parsed.data.expiresAt ?? null,
      status: "esperando",
    })
    .select("id")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return { ok: true, data: { id: data.id } };
}

/**
 * Mueve una entrada por su pequeña máquina de estados
 * (`esperando → avisado → agendado | descartado`).
 *
 * El estado se valida contra el enum antes de escribir: un valor fuera de
 * catálogo lo rechazaría la base con un mensaje que nadie entiende, y aquí se
 * corta con uno que sí.
 */
export async function setWaitlistStatus(
  entryId: string,
  status: string,
): Promise<ActionResult<null>> {
  const access = await requireSalonId();
  if (!access.ok) return { ok: false, error: access.error };

  const parsed = waitlistStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Ese estado no existe en la lista de espera." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("waitlist_entry")
    .update({
      status: parsed.data,
      // Marcar "avisado" deja constancia de cuándo, para no acribillar a la
      // misma persona con cada hueco que salga.
      ...(parsed.data === "avisado" ? { notified_at: new Date().toISOString() } : {}),
    })
    .eq("id", entryId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return { ok: true, data: null };
}
