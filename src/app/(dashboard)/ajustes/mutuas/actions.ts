"use server";

/**
 * Server actions de MUTUAS Y SEGUROS (odontología): catálogo de aseguradoras
 * (`insurer`) y su baremo de precios por servicio (`insurer_service_price`).
 *
 * Mismo patrón que `planes/actions.ts` / `expediente/actions.ts`: gate
 * explícito de sector (odontologia) + rol en servidor, ADICIONAL a RLS,
 * porque la política `insurer_rw`/`insurer_service_price_rw` acota por
 * `salon_id` pero no comprueba el sector del salón — sin este gate un
 * owner/manager de un salón de peluquería podría escribir aquí invocando la
 * Server Action directamente.
 *
 * A diferencia de `planes/actions.ts` (que permite `staff`), esta sección
 * vive bajo `/ajustes` — ya gateado a nivel de layout a owner/manager
 * (`SETTINGS_ROLES` de `@/lib/salon`) — así que el gate aquí exige el MISMO
 * rol mínimo (owner/manager), sin admitir `staff`.
 */
import { revalidatePath } from "next/cache";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type { Insurer, InsurerInsert, InsurerServicePrice, MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_SECTOR =
  "Las mutuas y seguros solo están disponibles para salones del sector odontología.";
const ERROR_ROLE = "No tienes permiso para gestionar mutuas y seguros.";

/** Roles con permiso de escritura. Mismo mínimo que el resto de /ajustes: `staff` queda excluido. */
const MANAGE_ROLES: readonly MemberRole[] = ["owner", "manager"];

// ---------------------------------------------------------------------------
// Gate — defensa en profundidad (sector + rol), igual que planes/actions.ts
// ---------------------------------------------------------------------------

async function assertMutuasAccess(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return { ok: false, error: ERROR_NO_SALON };
  }
  if (salon.sector !== "odontologia") {
    return { ok: false, error: ERROR_SECTOR };
  }

  const membership = await getActiveMembership();
  if (membership === null || !MANAGE_ROLES.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }

  return { ok: true, salonId: salon.id };
}

// ---------------------------------------------------------------------------
// createInsurer / updateInsurer / deleteInsurer
// ---------------------------------------------------------------------------

export interface InsurerFormInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  active?: boolean;
}

/** Traduce el input del formulario a un payload persistible (cadenas vacías → null). */
function toInsurerPayload(input: InsurerFormInput): {
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
} {
  const trimmedPhone = input.phone?.trim() ?? "";
  const trimmedEmail = input.email?.trim() ?? "";
  const trimmedNotes = input.notes?.trim() ?? "";
  return {
    name: input.name.trim(),
    phone: trimmedPhone === "" ? null : trimmedPhone,
    email: trimmedEmail === "" ? null : trimmedEmail,
    notes: trimmedNotes === "" ? null : trimmedNotes,
    active: input.active ?? true,
  };
}

/** Crea una aseguradora en el salón activo. */
export async function createInsurer(input: InsurerFormInput): Promise<ActionResult<Insurer>> {
  const access = await assertMutuasAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const payload = toInsurerPayload(input);
  if (payload.name === "") {
    return { ok: false, error: "El nombre de la aseguradora es obligatorio." };
  }

  const supabase = createClient();
  const insertPayload: InsurerInsert = { salon_id: access.salonId, ...payload };

  const { data, error } = await supabase
    .from("insurer")
    .insert(insertPayload)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/mutuas");
  return { ok: true, data };
}

/** Actualiza una aseguradora existente. */
export async function updateInsurer(
  insurerId: string,
  input: InsurerFormInput,
): Promise<ActionResult<Insurer>> {
  const access = await assertMutuasAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const payload = toInsurerPayload(input);
  if (payload.name === "") {
    return { ok: false, error: "El nombre de la aseguradora es obligatorio." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("insurer")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", insurerId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/mutuas");
  return { ok: true, data };
}

/** Elimina una aseguradora (cascada a pólizas y baremo vía FK ON DELETE CASCADE). */
export async function deleteInsurer(insurerId: string): Promise<ActionResult<{ id: string }>> {
  const access = await assertMutuasAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("insurer")
    .delete()
    .eq("id", insurerId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/mutuas");
  return { ok: true, data: { id: insurerId } };
}

// ---------------------------------------------------------------------------
// setInsurerServicePrice / removeInsurerServicePrice — baremo
// ---------------------------------------------------------------------------

export interface SetInsurerServicePriceInput {
  insurerId: string;
  serviceId: string;
  priceCents: number;
}

/**
 * Fija el precio de un servicio en el baremo de una aseguradora. Upsert por
 * `(insurer_id, service_id)` (constraint UNIQUE de la tabla): crea la línea
 * si no existe, actualiza el precio si ya existía.
 */
export async function setInsurerServicePrice(
  input: SetInsurerServicePriceInput,
): Promise<ActionResult<InsurerServicePrice>> {
  const access = await assertMutuasAccess();
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    return { ok: false, error: "El precio no es válido." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("insurer_service_price")
    .upsert(
      {
        salon_id: access.salonId,
        insurer_id: input.insurerId,
        service_id: input.serviceId,
        price_cents: input.priceCents,
      },
      { onConflict: "insurer_id,service_id" },
    )
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/mutuas");
  return { ok: true, data };
}

/** Quita una línea del baremo de una aseguradora. */
export async function removeInsurerServicePrice(
  priceId: string,
): Promise<ActionResult<{ id: string }>> {
  const access = await assertMutuasAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("insurer_service_price")
    .delete()
    .eq("id", priceId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/mutuas");
  return { ok: true, data: { id: priceId } };
}
