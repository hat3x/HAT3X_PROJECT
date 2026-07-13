"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { serviceSchema, type ServiceInput } from "@/lib/validations/service";
import type { Service, TablesInsert } from "@/types/database";

/** Resultado tipado de un Server Action de servicio. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Traduce los valores validados a un payload persistible.
 *
 * Nota: `duration_minutes_total` y `duration_minutes` son columnas generadas
 * en la base de datos (no aparecen en `TablesInsert<"services">`), por lo que
 * se omiten deliberadamente. `values.price` ya está en céntimos.
 */
function toWritePayload(
  values: ReturnType<typeof serviceSchema.parse>,
): Omit<TablesInsert<"services">, "salon_id"> {
  return {
    name: values.name,
    category: values.category ?? null,
    description: values.description ?? null,
    application_min: values.application_min,
    exposure_min: values.exposure_min,
    post_exposure_min: values.post_exposure_min,
    price_cents: values.price,
    active: values.active,
  };
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/**
 * Resuelve el salón activo y verifica que el rol pueda administrar ajustes.
 * Defensa en profundidad: el layout ya bloquea a `staff`, pero los Server
 * Actions se ejecutan de forma independiente y deben revalidar el permiso.
 */
async function requireManagerSalonId(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const membership = await getActiveMembership();
  if (membership === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }
  if (membership.role !== "owner" && membership.role !== "manager") {
    return { ok: false, error: "No tienes permiso para gestionar servicios" };
  }
  return { ok: true, salonId: membership.salonId };
}

/** Crea un servicio en el salón activo. */
export async function createService(
  input: ServiceInput,
): Promise<ActionResult<Service>> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({ salon_id: auth.salonId, ...toWritePayload(parsed.data) })
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/servicios");
  return { ok: true, data };
}

/** Actualiza un servicio existente. */
export async function updateService(
  serviceId: string,
  input: ServiceInput,
): Promise<ActionResult<Service>> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .update(toWritePayload(parsed.data))
    .eq("id", serviceId)
    .eq("salon_id", auth.salonId)
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/servicios");
  return { ok: true, data };
}

/** Elimina un servicio del catálogo. */
export async function deleteService(
  serviceId: string,
): Promise<ActionResult<null>> {
  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("salon_id", auth.salonId);

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/servicios");
  return { ok: true, data: null };
}
