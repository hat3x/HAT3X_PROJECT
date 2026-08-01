"use server";

/**
 * Server actions de RECETAS / PRESCRIPCIONES (odontología): cabecera
 * (`prescription`) + renglones de medicación (`prescription_item`).
 *
 * Mismo patrón que `expediente/actions.ts` (consentimientos): gate explícito
 * de sector (odontologia) + rol en servidor, ADICIONAL a RLS, porque las
 * políticas `prescription_rw`/`prescription_item_rw` acotan por `salon_id`
 * pero no comprueban el sector del salón — sin este gate un owner/manager de
 * un salón de peluquería podría escribir recetas invocando la Server Action
 * directamente.
 *
 * Inmutabilidad: el trigger `prescription_guard` (BD) impide editar una
 * receta emitida/revocada (una `issued` solo puede pasar a `revoked`; una
 * `revoked` es inmutable) y bloquea el DELETE salvo en `draft`;
 * `prescription_item_guard` impide tocar renglones cuando la cabecera ya no
 * es `draft`. `canIssuePrescription`/`canRevokePrescription`
 * (`@/lib/dental/prescriptions`) son la MISMA máquina de estados comprobada
 * aquí ANTES de tocar la BD, para devolver un error legible en vez del
 * mensaje crudo del trigger.
 */
import { canIssuePrescription, canRevokePrescription } from "@/lib/dental/prescriptions";
import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type {
  MemberRole,
  Prescription,
  PrescriptionInsert,
  PrescriptionItem,
  PrescriptionItemInsert,
} from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_SECTOR = "Las recetas solo están disponibles para salones del sector odontología.";
const ERROR_ROLE = "No tienes permiso para escribir en las recetas.";

/** Roles con permiso de escritura general UNA VEZ pasado el gate de sector. */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

/** Roles con permiso de borrado de recetas. `staff` queda excluido. */
const DELETE_ROLES: readonly MemberRole[] = ["owner", "manager"];

// ---------------------------------------------------------------------------
// Gate — defensa en profundidad (sector + rol), igual que expediente/actions.ts
// ---------------------------------------------------------------------------

async function assertPrescriptionAccess(
  requiredRoles: readonly MemberRole[] = WRITE_ROLES,
): Promise<{ ok: true; salonId: string } | { ok: false; error: string }> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return { ok: false, error: ERROR_NO_SALON };
  }
  if (salon.sector !== "odontologia") {
    return { ok: false, error: ERROR_SECTOR };
  }

  const membership = await getActiveMembership();
  if (membership === null || !requiredRoles.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }

  return { ok: true, salonId: salon.id };
}

// ---------------------------------------------------------------------------
// createPrescription
// ---------------------------------------------------------------------------

export interface CreatePrescriptionInput {
  customerId: string;
  prescriberName?: string;
  diagnosis?: string;
  notes?: string;
}

/** Crea la cabecera de una receta en estado `'draft'`, acotada al salón activo. */
export async function createPrescription(
  input: CreatePrescriptionInput,
): Promise<ActionResult<Prescription>> {
  const access = await assertPrescriptionAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload: PrescriptionInsert = {
    salon_id: access.salonId,
    customer_id: input.customerId,
    prescriber_name: input.prescriberName ?? null,
    diagnosis: input.diagnosis ?? null,
    notes: input.notes ?? null,
    status: "draft",
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase.from("prescription").insert(payload).select().single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// addPrescriptionItem
// ---------------------------------------------------------------------------

export interface AddPrescriptionItemInput {
  prescriptionId: string;
  medication: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  instructions?: string;
}

/**
 * Añade un renglón de medicación a una receta. `position` se calcula como el
 * recuento actual de renglones de la receta (0-based), acotado por salón.
 * El trigger `prescription_item_guard` (BD) rechaza el insert si la cabecera
 * ya no está en `'draft'`.
 */
export async function addPrescriptionItem(
  input: AddPrescriptionItemInput,
): Promise<ActionResult<PrescriptionItem>> {
  const access = await assertPrescriptionAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { count, error: countError } = await supabase
    .from("prescription_item")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", access.salonId)
    .eq("prescription_id", input.prescriptionId);

  if (countError !== null) return { ok: false, error: countError.message };

  const payload: PrescriptionItemInsert = {
    salon_id: access.salonId,
    prescription_id: input.prescriptionId,
    position: count ?? 0,
    medication: input.medication,
    dose: input.dose ?? null,
    frequency: input.frequency ?? null,
    duration: input.duration ?? null,
    quantity: input.quantity ?? null,
    instructions: input.instructions ?? null,
  };

  const { data, error } = await supabase
    .from("prescription_item")
    .insert(payload)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// issuePrescription
// ---------------------------------------------------------------------------

/**
 * Emite una receta (`'draft' → 'issued'`), fijando `issued_at` y `signed_by`.
 * Verifica {@link canIssuePrescription} sobre el estado ACTUAL leído de BD
 * antes de escribir (el trigger `prescription_guard` es la última línea de
 * defensa, pero aquí devolvemos un mensaje legible). A partir de aquí la
 * receta y sus renglones son inmutables (solo se puede revocar).
 */
export async function issuePrescription(
  prescriptionId: string,
): Promise<ActionResult<Prescription>> {
  const access = await assertPrescriptionAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing, error: fetchError } = await supabase
    .from("prescription")
    .select("*")
    .eq("id", prescriptionId)
    .eq("salon_id", access.salonId)
    .single();

  if (fetchError !== null) return { ok: false, error: fetchError.message };

  if (!canIssuePrescription(existing.status)) {
    return {
      ok: false,
      error: `No se puede emitir una receta en estado '${existing.status}'.`,
    };
  }

  const { data, error } = await supabase
    .from("prescription")
    .update({
      status: "issued",
      issued_at: new Date().toISOString(),
      signed_by: user?.id ?? null,
    })
    .eq("id", prescriptionId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// revokePrescription
// ---------------------------------------------------------------------------

/**
 * Revoca una receta (`'issued' → 'revoked'`), fijando `revoked_at`. Verifica
 * {@link canRevokePrescription} sobre el estado ACTUAL antes de escribir. A
 * partir de aquí el registro es inmutable (trigger de BD).
 */
export async function revokePrescription(
  prescriptionId: string,
): Promise<ActionResult<Prescription>> {
  const access = await assertPrescriptionAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("prescription")
    .select("*")
    .eq("id", prescriptionId)
    .eq("salon_id", access.salonId)
    .single();

  if (fetchError !== null) return { ok: false, error: fetchError.message };

  if (!canRevokePrescription(existing.status)) {
    return {
      ok: false,
      error: `No se puede revocar una receta en estado '${existing.status}'.`,
    };
  }

  const { data, error } = await supabase
    .from("prescription")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", prescriptionId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// deletePrescription — solo 'draft' (owner/manager)
// ---------------------------------------------------------------------------

/**
 * Borra una receta, solo si sigue en `'draft'` (una `'issued'`/`'revoked'` es
 * inmutable — el trigger `prescription_guard` también bloquea el DELETE en
 * ese caso, pero aquí devolvemos un mensaje legible antes de intentarlo).
 * Requiere rol owner/manager. Los renglones se borran en cascada
 * (`prescription_item_fk ... on delete cascade`).
 */
export async function deletePrescription(
  prescriptionId: string,
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPrescriptionAccess(DELETE_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("prescription")
    .select("status")
    .eq("id", prescriptionId)
    .eq("salon_id", access.salonId)
    .single();

  if (fetchError !== null) return { ok: false, error: fetchError.message };

  if (existing.status !== "draft") {
    return {
      ok: false,
      error: `Solo se puede borrar una receta en borrador (estado actual: '${existing.status}').`,
    };
  }

  const { error } = await supabase
    .from("prescription")
    .delete()
    .eq("id", prescriptionId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data: { id: prescriptionId } };
}
