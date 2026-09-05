"use server";

import { revalidatePath } from "next/cache";

import { canManageSettings, getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  salonSettingsSchema,
  type SalonSettingsInput,
} from "@/lib/validations/salon";
import type { Salon, TablesUpdate } from "@/types/database";

/** Resultado tipado de un Server Action de ajustes del salón. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Traduce los valores validados a un payload persistible (opcionales → null). */
function toWritePayload(
  values: ReturnType<typeof salonSettingsSchema.parse>,
): TablesUpdate<"salons"> {
  return {
    name: values.name,
    timezone: values.timezone,
    phone: values.phone ?? null,
    email: values.email ?? null,
    address: values.address ?? null,
  };
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/**
 * Actualiza los datos generales del salón activo.
 *
 * Defensa en profundidad: además del guard de ruta del layout, exigimos aquí
 * que el usuario tenga rol `owner`/`manager` y scopeamos la escritura al salón
 * de su pertenencia activa. RLS es la última línea de defensa.
 */
export async function updateSalon(
  input: SalonSettingsInput,
): Promise<ActionResult<Salon>> {
  const parsed = salonSettingsSchema.safeParse(input);
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

  revalidatePath("/ajustes/datos");
  return { ok: true, data };
}
