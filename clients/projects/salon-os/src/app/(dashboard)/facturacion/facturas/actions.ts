"use server";

import { revalidatePath } from "next/cache";

import { canManageSettings, getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

/** Resultado tipado de un Server Action del libro de facturas. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Borra una factura del salón activo.
 *
 * Verifactu ya NO aplica (sin cadena de huella ni inmutabilidad), así que una factura
 * es un registro normal y se puede eliminar —típicamente para corregir un error de
 * emisión—. Defensa en profundidad:
 *   1. rol owner/manager en TS (mensaje 403 legible antes de topar con la RLS);
 *   2. acotado a `salon_id` del usuario (aislamiento multi-tenant);
 *   3. la RLS `members_delete_pos_invoices` es la última línea.
 *
 * Revalida la ruta del libro para que la fila desaparezca al instante.
 */
export async function deleteInvoiceAction(
  invoiceId: string,
): Promise<ActionResult<{ id: string }>> {
  if (typeof invoiceId !== "string" || invoiceId.trim() === "") {
    return { ok: false, error: "Factura no válida." };
  }

  const membership = await getActiveMembership();
  if (membership === null) {
    return { ok: false, error: "No tienes un salón asignado." };
  }
  if (!canManageSettings(membership.role)) {
    return { ok: false, error: "No tienes permiso para borrar facturas." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_invoices")
    .delete()
    .eq("id", invoiceId)
    .eq("salon_id", membership.salonId)
    .select("id")
    .maybeSingle();

  if (error !== null) {
    return { ok: false, error: "No se pudo borrar la factura. Inténtalo de nuevo." };
  }
  if (data === null) {
    return { ok: false, error: "La factura no existe o no es accesible." };
  }

  revalidatePath("/facturacion/facturas");
  return { ok: true, data: { id: data.id } };
}
