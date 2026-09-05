"use server";

/**
 * Server actions de SEGURO/MUTUA DEL PACIENTE (`customer_insurance`),
 * odontología.
 *
 * Mismo patrón que `expediente/actions.ts` / `planes/actions.ts`: gate
 * explícito de sector (odontologia) + rol en servidor, ADICIONAL a RLS,
 * porque la política `customer_insurance_rw` acota por `salon_id` pero no
 * comprueba el sector del salón — sin este gate un owner/manager de un salón
 * de peluquería podría escribir aquí invocando la Server Action directamente.
 *
 * `WRITE_ROLES` incluye `staff` (igual que `planes/actions.ts`): asignar el
 * seguro de un paciente es parte del flujo clínico normal, no una tarea
 * exclusiva de gestión (a diferencia de `ajustes/mutuas/actions.ts`, que
 * administra el CATÁLOGO de aseguradoras y exige owner/manager).
 *
 * NOTA sobre la FK: `customer_insurance.customer_id` referencia
 * `clinical_records(customer_id, salon_id)` (igual que `treatment_plan`), así
 * que el paciente debe tener una ficha clínica creada (`saveClinicalRecord`)
 * ANTES de poder asignarle un seguro; si no existe, el INSERT falla con el
 * error de FK de Postgres, propagado tal cual como `error.message`.
 */
import { revalidatePath } from "next/cache";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type { CustomerInsurance, CustomerInsuranceInsert, MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_SECTOR =
  "El seguro/mutua del paciente solo está disponible para salones del sector odontología.";
const ERROR_ROLE = "No tienes permiso para gestionar el seguro del paciente.";

/** Roles con permiso de escritura, igual que `planes/actions.ts` (`staff` incluido). */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

// ---------------------------------------------------------------------------
// Gate — defensa en profundidad (sector + rol), igual que expediente/actions.ts
// ---------------------------------------------------------------------------

async function assertInsuranceAccess(): Promise<
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
  if (membership === null || !WRITE_ROLES.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }

  return { ok: true, salonId: salon.id };
}

// ---------------------------------------------------------------------------
// addCustomerInsurance
// ---------------------------------------------------------------------------

export interface AddCustomerInsuranceInput {
  customerId: string;
  insurerId: string;
  policyNumber?: string | null;
  notes?: string | null;
}

/** Asigna una aseguradora (póliza) a un paciente. */
export async function addCustomerInsurance(
  input: AddCustomerInsuranceInput,
): Promise<ActionResult<CustomerInsurance>> {
  const access = await assertInsuranceAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const trimmedPolicy = input.policyNumber?.trim() ?? "";
  const trimmedNotes = input.notes?.trim() ?? "";

  const payload: CustomerInsuranceInsert = {
    salon_id: access.salonId,
    customer_id: input.customerId,
    insurer_id: input.insurerId,
    policy_number: trimmedPolicy === "" ? null : trimmedPolicy,
    notes: trimmedNotes === "" ? null : trimmedNotes,
  };

  const { data, error } = await supabase
    .from("customer_insurance")
    .insert(payload)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// removeCustomerInsurance
// ---------------------------------------------------------------------------

/** Quita una aseguradora (póliza) de un paciente. */
export async function removeCustomerInsurance(
  insuranceId: string,
): Promise<ActionResult<{ id: string }>> {
  const access = await assertInsuranceAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("customer_insurance")
    .delete()
    .eq("id", insuranceId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };

  return { ok: true, data: { id: insuranceId } };
}
