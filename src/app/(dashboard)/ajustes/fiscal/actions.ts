"use server";

import { revalidatePath } from "next/cache";

import { canManageSettings, getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  salonFiscalSchema,
  type SalonFiscalInput,
} from "@/lib/validations/salon-fiscal";
import type { Salon, TablesUpdate } from "@/types/database";

/** Resultado tipado de un Server Action de ajustes del salón. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Traduce los valores validados a un payload persistible (opcionales → null). */
function toWritePayload(
  values: ReturnType<typeof salonFiscalSchema.parse>,
): TablesUpdate<"salons"> {
  return {
    tax_id: values.tax_id ?? null,
    legal_name: values.legal_name ?? null,
    fiscal_address: values.fiscal_address ?? null,
  };
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/**
 * Actualiza los datos fiscales del salón activo (NIF/CIF, razón social y
 * domicilio fiscal del emisor de facturas).
 *
 * Defensa en profundidad: además del guard de ruta del layout, exigimos aquí
 * que el usuario tenga rol `owner`/`manager` y scopeamos la escritura al salón
 * de su pertenencia activa. RLS es la última línea de defensa.
 */
export async function updateSalonFiscal(
  input: SalonFiscalInput,
): Promise<ActionResult<Salon>> {
  const parsed = salonFiscalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const membership = await getActiveMembership();
  if (membership === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }
  if (!canManageSettings(membership.role)) {
    return { ok: false, error: "No tienes permiso para editar el salón" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("salons")
    .update(toWritePayload(parsed.data))
    .eq("id", membership.salonId)
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/fiscal");
  return { ok: true, data };
}
