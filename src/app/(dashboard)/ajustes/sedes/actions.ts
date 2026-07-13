"use server";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { locationSchema, type LocationInput } from "@/lib/validations/location";
import type { Location, TablesInsert } from "@/types/database";

/** Resultado tipado de un Server Action de sede. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Código de error de Postgres para violación de constraint UNIQUE. */
const UNIQUE_VIOLATION = "23505";

/** Traduce los valores validados a un payload persistible (opcionales → null). */
function toWritePayload(
  values: ReturnType<typeof locationSchema.parse>,
): Omit<TablesInsert<"locations">, "salon_id"> {
  return {
    name: values.name,
    slug: values.slug,
    address: values.address ?? null,
    phone: values.phone ?? null,
  };
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/**
 * Traduce el error de Supabase a un mensaje legible. La violación del
 * `unique (salon_id, slug)` se muestra como conflicto de identificador.
 */
function toFriendlyError(error: { code?: string; message: string }): string {
  if (error.code === UNIQUE_VIOLATION) {
    return "Ya existe una sede con ese identificador. Elige otro.";
  }
  return error.message;
}

/** Crea una sede en el salón activo. */
export async function createLocation(
  input: LocationInput,
): Promise<ActionResult<Location>> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("locations")
    .insert({ salon_id: salonId, ...toWritePayload(parsed.data) })
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: toFriendlyError(error) };
  }

  revalidatePath("/ajustes/sedes");
  return { ok: true, data };
}

/** Actualiza una sede existente. */
export async function updateLocation(
  locationId: string,
  input: LocationInput,
): Promise<ActionResult<Location>> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("locations")
    .update(toWritePayload(parsed.data))
    .eq("id", locationId)
    .eq("salon_id", salonId)
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: toFriendlyError(error) };
  }

  revalidatePath("/ajustes/sedes");
  return { ok: true, data };
}

/**
 * Activa o desactiva una sede (baja lógica). No se elimina físicamente para
 * preservar la integridad referencial con los profesionales asociados.
 */
export async function setLocationActive(
  locationId: string,
  active: boolean,
): Promise<ActionResult<Location>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("locations")
    .update({ active })
    .eq("id", locationId)
    .eq("salon_id", salonId)
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: toFriendlyError(error) };
  }

  revalidatePath("/ajustes/sedes");
  return { ok: true, data };
}
