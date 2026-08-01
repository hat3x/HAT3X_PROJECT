"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type { ServiceMaterial } from "@/types/database";

/** Resultado tipado de un Server Action del escandallo de materiales. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_ROLE = "No tienes permiso para gestionar el escandallo de materiales.";
const ERROR_QUANTITY = "La cantidad debe ser mayor que cero.";
/** Código de error PostgreSQL para violación de restricción UNIQUE. */
const PG_UNIQUE_VIOLATION = "23505";
const ERROR_DUPLICATE =
  "Este producto ya forma parte del escandallo de este servicio.";

/**
 * Gate explícito en servidor (rol únicamente, sin sector — el escandallo de
 * materiales aplica a todos los sectores, igual que `stock-actions.ts`),
 * ADICIONAL a la RLS de `service_material`. Mismo patrón que
 * `requireManagerSalonId` de `ajustes/servicios/actions.ts`: solo
 * owner/manager pueden escribir (a diferencia de `stock-actions.ts`, que
 * también deja escribir a `staff` — aquí el escandallo es configuración del
 * catálogo, no una operación diaria de caja).
 */
async function requireManagerSalonId(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const membership = await getActiveMembership();
  if (membership === null) {
    return { ok: false, error: ERROR_NO_SALON };
  }
  if (membership.role !== "owner" && membership.role !== "manager") {
    return { ok: false, error: ERROR_ROLE };
  }
  return { ok: true, salonId: membership.salonId };
}

/** Traduce un error de Postgres a un mensaje legible cuando aplica; si no, lo devuelve tal cual. */
function toReadableError(error: { code?: string; message: string }): string {
  if (error.code === PG_UNIQUE_VIOLATION) {
    return ERROR_DUPLICATE;
  }
  return error.message;
}

// ---------------------------------------------------------------------------
// addServiceMaterial
// ---------------------------------------------------------------------------

export interface AddServiceMaterialInput {
  serviceId: string;
  productId: string;
  quantity: number;
}

/**
 * Añade un material al escandallo (BOM) de un servicio: cuánto de un
 * producto se consume por cada 1x del servicio. `UNIQUE(service_id,
 * product_id)` en BD evita duplicar la misma línea (se traduce a un mensaje
 * legible en vez del error crudo de Postgres).
 */
export async function addServiceMaterial(
  input: AddServiceMaterialInput,
): Promise<ActionResult<ServiceMaterial>> {
  const auth = await requireManagerSalonId();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: ERROR_QUANTITY };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_material")
    .insert({
      salon_id: auth.salonId,
      service_id: input.serviceId,
      product_id: input.productId,
      quantity: input.quantity,
    })
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: toReadableError(error) };

  revalidatePath("/ajustes/servicios");
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// removeServiceMaterial
// ---------------------------------------------------------------------------

/** Quita un material del escandallo de un servicio. */
export async function removeServiceMaterial(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagerSalonId();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("service_material")
    .delete()
    .eq("id", id)
    .eq("salon_id", auth.salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/servicios");
  return { ok: true, data: { id } };
}

// ---------------------------------------------------------------------------
// updateServiceMaterialQty
// ---------------------------------------------------------------------------

/** Actualiza la cantidad consumida de una línea del escandallo. */
export async function updateServiceMaterialQty(
  id: string,
  quantity: number,
): Promise<ActionResult<ServiceMaterial>> {
  const auth = await requireManagerSalonId();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: ERROR_QUANTITY };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_material")
    .update({ quantity })
    .eq("id", id)
    .eq("salon_id", auth.salonId)
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/servicios");
  return { ok: true, data };
}
