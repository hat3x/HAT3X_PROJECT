"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  orthoDataSchema,
  orthoVisitSchema,
  type OrthoDataInput,
  type OrthoVisitInput,
} from "@/lib/validations/ortho";
import type { Json, MemberRole, OrthoVisit } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado";
const ERROR_SECTOR = "Esta sección solo está disponible en clínicas dentales";
const ERROR_ROLE = "No tienes permisos para esta acción";

// clinical_records restringe INSERT/UPDATE a owner/manager por RLS; ortho_visit permite staff.
const FICHA_ROLES: readonly MemberRole[] = ["owner", "manager"];
const VISIT_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

async function assertOrthoAccess(
  requiredRoles: readonly MemberRole[],
): Promise<{ ok: true; salonId: string } | { ok: false; error: string }> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };
  if (salon.sector !== "odontologia") return { ok: false, error: ERROR_SECTOR };

  const membership = await getActiveMembership();
  if (membership === null || !requiredRoles.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }
  return { ok: true, salonId: salon.id };
}

/**
 * Guarda ficha + tratamiento ortho haciendo MERGE sobre clinical_records.data:
 * lee el data actual, reemplaza SOLO el sub-árbol `ortho`, y reescribe. Preserva
 * cualquier otra clave de `data`. Upsert por customer_id (crea la ficha si no existe).
 */
export async function saveOrthoData(
  customerId: string,
  input: OrthoDataInput,
): Promise<ActionResult<null>> {
  const parsed = orthoDataSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertOrthoAccess(FICHA_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: current, error: readErr } = await supabase
    .from("clinical_records")
    .select("data")
    .eq("customer_id", customerId)
    .eq("salon_id", access.salonId)
    .maybeSingle();
  if (readErr !== null) return { ok: false, error: readErr.message };

  const existing = (current?.data ?? {}) as Record<string, unknown>;
  const nextData = { ...existing, ortho: parsed.data } as Json;

  const { error } = await supabase
    .from("clinical_records")
    .upsert(
      { customer_id: customerId, salon_id: access.salonId, data: nextData },
      { onConflict: "customer_id" },
    );
  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Añade una entrada al timeline de visitas ortho. */
export async function addOrthoVisit(
  customerId: string,
  input: OrthoVisitInput,
): Promise<ActionResult<OrthoVisit>> {
  const parsed = orthoVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertOrthoAccess(VISIT_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("ortho_visit")
    .insert({
      salon_id: access.salonId,
      customer_id: customerId,
      appointment_id: parsed.data.appointmentId,
      visit_date: parsed.data.visitDate,
      actions: parsed.data.actions as Json,
      notes: parsed.data.notes,
      next_step: parsed.data.nextStep,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data };
}

/** Borra una visita del timeline (owner/manager/staff, acotado por salón). */
export async function deleteOrthoVisit(visitId: string): Promise<ActionResult<null>> {
  const access = await assertOrthoAccess(VISIT_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("ortho_visit")
    .delete()
    .eq("id", visitId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}
