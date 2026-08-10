"use server";
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { addOrderItemsSchema, createOrderSchema, voidOrderItemSchema } from "@/lib/validations/order";
import type { Order, OrderItem, OrderItemInsert } from "@/types/database";

/**
 * Server actions de pedido de mostrador (restauración, Task 4): crear pedido
 * (idempotente por `idempotencyKey`), añadir líneas y anular una línea.
 *
 * A diferencia de `carta/actions.ts` (gate de rol vía `assertManager`), aquí
 * solo se exige salón activo (`getActiveSalonId`) — no rol de gestión: es el
 * flujo operativo del día a día (tomar pedidos, añadir líneas, anular una
 * línea mal tecleada), no configuración de carta. La restricción real de
 * quién puede tocar `/mostrador` vive en la navegación/gate de esa ruta, no
 * en estas actions.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// createOrder: idempotente por `idempotencyKey` — si YA existe una fila con
// esa key en el salón, se devuelve tal cual (no reinserta, no actualiza). El
// `id` lo genera el CLIENTE (offline-ready, ver migración
// 20260810100000_restauracion_orders): se inserta tal cual llega, ya validado
// como uuid por el schema. Reintentos de red del cliente (mismo `idempotencyKey`,
// `id` distinto si genera uno nuevo) no duplican el pedido.
// ─────────────────────────────────────────────────────────────────────────────

export async function createOrder(input: unknown): Promise<ActionResult<Order>> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  if (parsed.data.idempotencyKey !== null) {
    const { data: existing } = await supabase.from("orders").select("*")
      .eq("salon_id", salonId).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
    if (existing) return { ok: true, data: existing };
  }
  const { data, error } = await supabase.from("orders").insert({
    id: parsed.data.id, salon_id: salonId, label: parsed.data.label,
    idempotency_key: parsed.data.idempotencyKey, channel: "mostrador", status: "abierta",
  }).select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/mostrador");
  return { ok: true, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// addOrderItems: el pedido debe existir EN ESTE salón y estar `abierta` — no
// se puede añadir líneas a un pedido de otro salón (aislamiento multi-tenant
// en profundidad, además de RLS) ni a uno ya cobrado/cerrado/anulado. El lote
// completo se inserta en un único `insert` (todas las líneas o ninguna: si
// Postgres rechaza una fila, ninguna del lote queda a medias) con ids de
// cliente ya validados como uuid por `orderItemDraftSchema`.
// ─────────────────────────────────────────────────────────────────────────────

export async function addOrderItems(input: unknown): Promise<ActionResult<{ added: number }>> {
  const parsed = addOrderItemsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders").select("id,status")
    .eq("id", parsed.data.orderId).eq("salon_id", salonId).maybeSingle();
  if (orderError !== null) return { ok: false, error: orderError.message };
  if (order === null || order.status !== "abierta") {
    return { ok: false, error: "El pedido no existe, no pertenece a tu salón o no está abierto" };
  }

  const rows: OrderItemInsert[] = parsed.data.items.map((item) => ({
    id: item.id,
    salon_id: salonId,
    order_id: parsed.data.orderId,
    product_id: item.productId,
    qty: item.qty,
    unit_price_cents: item.unitPriceCents,
    vat_rate: item.vatRate,
    station_id: item.stationId,
    combo_group: item.comboGroup,
    modifiers_snapshot: item.modifiersSnapshot,
    status: "pendiente",
  }));
  const { error } = await supabase.from("order_items").insert(rows);
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/mostrador");
  return { ok: true, data: { added: rows.length } };
}

// ─────────────────────────────────────────────────────────────────────────────
// voidOrderItem: append-only — NUNCA se hace UPDATE/DELETE de la línea
// original (histórico intacto para cocina/caja/auditoría). Se lee el ítem
// original acotado por `order_id` + `salon_id` (garantiza que pertenece AL
// PEDIDO y AL SALÓN indicados, aunque el `itemId` sea arbitrario) y se
// inserta una fila NUEVA que referencia la original vía `void_of_item_id`,
// con un `id` de cliente NUEVO generado en el SERVIDOR (`randomUUID` — a
// diferencia de createOrder/addOrderItems, esta fila no la propone el
// cliente porque nace de una acción de servidor, no de composición offline).
//
// Se copian solo los campos que importan para el histórico/cocina/caja
// (product_id/qty/station_id/order_id/salon_id/unit_price_cents/vat_rate),
// tal como pide el brief. `combo_group` y `modifiers_snapshot` NO se copian:
// la fila de anulación es un registro de auditoría de cantidad/importe (para
// que el ticket y el estado de cocina reflejen la baja), no una réplica
// visual de la línea — el modificador/combo ya quedó registrado en la línea
// original, que sigue existiendo (no se borra).
// ─────────────────────────────────────────────────────────────────────────────

export async function voidOrderItem(input: unknown): Promise<ActionResult<OrderItem>> {
  const parsed = voidOrderItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  const { data: original, error: fetchError } = await supabase
    .from("order_items").select("*")
    .eq("id", parsed.data.itemId).eq("order_id", parsed.data.orderId).eq("salon_id", salonId)
    .maybeSingle();
  if (fetchError !== null) return { ok: false, error: fetchError.message };
  if (original === null) return { ok: false, error: "El ítem no pertenece a tu salón o a ese pedido" };

  const payload: OrderItemInsert = {
    id: randomUUID(),
    salon_id: original.salon_id,
    order_id: original.order_id,
    product_id: original.product_id,
    qty: original.qty,
    unit_price_cents: original.unit_price_cents,
    vat_rate: original.vat_rate,
    station_id: original.station_id,
    status: "anulado",
    void_of_item_id: parsed.data.itemId,
    void_reason: parsed.data.reason,
  };
  const { data, error } = await supabase.from("order_items").insert(payload).select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/mostrador");
  return { ok: true, data };
}
