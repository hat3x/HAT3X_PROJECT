"use server";

import { revalidatePath } from "next/cache";

import { applyMovement, movementDelta } from "@/lib/stock";
import { getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, StockMovement, StockMovementKind } from "@/types/database";

/** Resultado tipado de un Server Action de stock. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Roles con permiso de escritura de movimientos de stock. A diferencia de
 * `planes/actions.ts` / `periodontograma/actions.ts`, el stock/inventario de
 * material NO tiene gate de sector: peluquería y odontología consumen
 * material por igual, así que cualquier salón puede escribir aquí — solo se
 * comprueba el ROL.
 */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_ROLE = "No tienes permiso para registrar movimientos de stock.";
const ERROR_PRODUCT_NOT_FOUND = "El producto no existe o no es accesible.";
const ERROR_INSUFFICIENT_STOCK = "No hay suficiente stock.";
const ERROR_ZERO_QUANTITY = "La cantidad no puede ser cero.";

/**
 * Gate explícito en servidor (rol únicamente, sin sector), ADICIONAL a la RLS
 * `stock_movement_rw` (que acota por `salon_id` pero no comprueba el rol del
 * miembro dentro del salón).
 */
async function assertStockWriteAccess(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const membership = await getActiveMembership();
  if (membership === null) {
    return { ok: false, error: ERROR_NO_SALON };
  }
  if (!WRITE_ROLES.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }
  return { ok: true, salonId: membership.salonId };
}

// ---------------------------------------------------------------------------
// recordStockMovement
// ---------------------------------------------------------------------------

export interface RecordStockMovementInput {
  productId: string;
  kind: StockMovementKind;
  /**
   * Para `entrada`/`salida`/`merma`: la MAGNITUD del movimiento (siempre se
   * toma su valor absoluto). Para `ajuste`: el NUEVO TOTAL de stock.
   */
  quantity: number;
  /** Lote — normalmente informado en `entrada` (trazabilidad). */
  lot?: string | null;
  /** Fecha de caducidad `YYYY-MM-DD` — normalmente informada en `entrada`. */
  expiry?: string | null;
  note?: string | null;
}

/**
 * Registra un movimiento de stock (`stock_movement`) y actualiza
 * `products.stock` al nuevo total, acotado al salón activo del usuario.
 *
 * Sin gate de sector (a diferencia de los módulos dentales): cualquier
 * owner/manager/staff del salón puede registrar movimientos.
 *
 * NOTA sobre atomicidad: el insert de `stock_movement` y el update de
 * `products.stock` son dos llamadas secuenciales al cliente Supabase (sin
 * transacción cliente-servidor disponible sin una función RPC, y la
 * migración de este módulo ya está aplicada y no se debe tocar). Si el
 * insert tiene éxito pero el update falla, el movimiento queda registrado
 * sin reflejarse en `products.stock` — caso raro (solo un fallo de red/BD
 * entre ambas llamadas) documentado aquí como limitación conocida de v1; una
 * futura función RPC podría envolver ambas escrituras en una transacción real.
 */
export async function recordStockMovement(
  input: RecordStockMovementInput,
): Promise<ActionResult<StockMovement>> {
  const access = await assertStockWriteAccess();
  if (!access.ok) {
    return { ok: false, error: access.error };
  }

  if (input.quantity === 0) {
    return { ok: false, error: ERROR_ZERO_QUANTITY };
  }

  const supabase = createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, stock")
    .eq("id", input.productId)
    .eq("salon_id", access.salonId)
    .single();

  if (productError !== null || product === null) {
    return { ok: false, error: ERROR_PRODUCT_NOT_FOUND };
  }

  // Un producto sin control de stock (stock === null) empieza a contarse
  // desde 0 en cuanto se registra el primer movimiento.
  const currentStock = product.stock ?? 0;
  const newStock = applyMovement(currentStock, input.kind, input.quantity);

  if (newStock < 0) {
    return { ok: false, error: ERROR_INSUFFICIENT_STOCK };
  }

  const delta = movementDelta(currentStock, input.kind, input.quantity);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: movement, error: insertError } = await supabase
    .from("stock_movement")
    .insert({
      salon_id: access.salonId,
      product_id: input.productId,
      kind: input.kind,
      quantity: delta,
      resulting_stock: newStock,
      lot: input.lot ?? null,
      expiry: input.expiry ?? null,
      note: input.note ?? null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (insertError !== null) {
    return { ok: false, error: insertError.message };
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ stock: newStock })
    .eq("id", input.productId)
    .eq("salon_id", access.salonId);

  if (updateError !== null) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/products");
  return { ok: true, data: movement };
}
