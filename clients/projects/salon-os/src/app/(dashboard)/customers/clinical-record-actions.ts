"use server";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  clinicalRecordSchema,
  type ClinicalRecordInput,
} from "@/lib/validations/clinical-record";
import type { ClinicalRecord } from "@/types/database";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/**
 * Upsert de la ficha clínica de un cliente.
 *
 * La tabla tiene PK = customer_id (1:1 con customers). Upsert con
 * onConflict garantiza idempotencia: crea si no existe, actualiza si existe.
 * RLS rechaza automáticamente a staff en salones no-dentales.
 */
export async function saveClinicalRecord(
  customerId: string,
  input: ClinicalRecordInput,
): Promise<ActionResult<ClinicalRecord>> {
  const parsed = clinicalRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload = {
    customer_id: customerId,
    salon_id: salonId,
    allergies: parsed.data.allergies,
    contraindications: parsed.data.contraindications,
    medications: parsed.data.medications,
    skin_hair_type: parsed.data.skin_hair_type ?? null,
    medical_notes: parsed.data.medical_notes ?? null,
    last_updated_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("clinical_records")
    .upsert(payload, { onConflict: "customer_id" })
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: true, data };
}
