"use server";
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  addOrderItemsSchema,
  createOrderSchema,
  sendOrderToStationsSchema,
  setOrderItemStatusSchema,
  voidOrderItemSchema,
} from "@/lib/validations/order";
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

/** Cliente de Supabase con el tipo `Database` (para pasar entre helpers de guarda). */
type SupabaseServerClient = ReturnType<typeof createClient>;

const ORDER_NOT_OPEN_ERROR = "El pedido no existe, no pertenece a tu salón o no está abierto";

/**
 * Guarda de pertenencia + estado, compartida por `addOrderItems` y
 * `voidOrderItem`: el pedido debe existir EN ESTE salón y estar `abierta`.
 * Ni se pueden añadir líneas ni anular líneas de un pedido de otro salón
 * (aislamiento multi-tenant en profundidad, además de RLS) ni de uno ya
 * cobrado/cerrado/anulado — un pedido cobrado es un documento cerrado para
 * caja/fiscalidad, no se toca. Devuelve `null` si el pedido está abierto y
 * pertenece al salón; si no, el mensaje de error a propagar.
 */
async function assertOrderOpenInSalon(
  supabase: SupabaseServerClient,
  salonId: string,
  orderId: string,
): Promise<string | null> {
  const { data: order, error } = await supabase
    .from("orders").select("id,status")
    .eq("id", orderId).eq("salon_id", salonId).maybeSingle();
  if (error !== null) return error.message;
  if (order === null || order.status !== "abierta") return ORDER_NOT_OPEN_ERROR;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// createOrder: idempotente por `idempotencyKey` — si YA existe una fila con
// esa key en el salón, se devuelve tal cual (no reinserta, no actualiza). El
// `id` lo genera el CLIENTE (offline-ready, ver migración
// 20260810100000_restauracion_orders): se inserta tal cual llega, ya validado
// como uuid por el schema. Reintentos de red del cliente (mismo `idempotencyKey`,
// `id` distinto si genera uno nuevo) no duplican el pedido.
//
// El select previo (`existing`) es un fast-path, NO la garantía de idempotencia
// — es "select-luego-insert", no atómico: dos requests concurrentes con la
// misma `idempotencyKey` pueden pasar AMBOS el select (ninguno ve todavía la
// fila del otro) y el segundo `insert` choca con el índice único
// `orders_idempotency_key` (Postgres `23505`). En ese caso NO se trata como un
// fallo: se relee la fila por `(salon_id, idempotency_key)` — el otro request
// ya la insertó — y se devuelve como propia. Así `createOrder` es idempotente
// de verdad ante condiciones de carrera, no solo en el caso sin carrera.
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
  if (error !== null) {
    if (error.code === "23505" && parsed.data.idempotencyKey !== null) {
      const { data: existing, error: refetchError } = await supabase.from("orders").select("*")
        .eq("salon_id", salonId).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
      if (refetchError !== null) return { ok: false, error: refetchError.message };
      if (existing) return { ok: true, data: existing };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/mostrador");
  return { ok: true, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// addOrderItems: ver `assertOrderOpenInSalon`. El lote completo se inserta en
// un único `insert` (todas las líneas o ninguna: si Postgres rechaza una
// fila, ninguna del lote queda a medias) con ids de cliente ya validados
// como uuid por `orderItemDraftSchema`.
// ─────────────────────────────────────────────────────────────────────────────

export async function addOrderItems(input: unknown): Promise<ActionResult<{ added: number }>> {
  const parsed = addOrderItemsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  const orderError = await assertOrderOpenInSalon(supabase, salonId, parsed.data.orderId);
  if (orderError !== null) return { ok: false, error: orderError };

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
// voidOrderItem: append-only para el HISTÓRICO — NUNCA se hace DELETE de la
// línea original. Primero pasa la MISMA guarda que `addOrderItems`
// (`assertOrderOpenInSalon`): no tiene sentido anular una línea de un pedido
// ya cobrado/cerrado (el ticket ya salió) ni de un pedido que no pertenece a
// este salón. Luego se lee el ítem original acotado por `order_id` +
// `salon_id` (garantiza que pertenece AL PEDIDO y AL SALÓN indicados, aunque
// el `itemId` sea arbitrario) y se rechaza si esa línea YA es una anulación
// (no tiene sentido anular una anulación).
//
// Dos escrituras, no una: (1) UPDATE del ítem ORIGINAL a `status: "anulado"`
// (+ `void_reason`) — necesario para que `settleOrder` (task futura, filtra
// `status != 'anulado'` al cargar líneas a cobrar) EXCLUYA esta línea del
// cobro. Sin este update, el original seguiría `pendiente`/`enviado`/…  y se
// cobraría igual pese a estar anulada — el bug que corrige este cambio. (2)
// INSERT de una fila NUEVA de auditoría que referencia la original vía
// `void_of_item_id`, con un `id` de cliente NUEVO generado en el SERVIDOR
// (`randomUUID` — a diferencia de createOrder/addOrderItems, esta fila no la
// propone el cliente porque nace de una acción de servidor, no de
// composición offline).
//
// El UPDATE va ANTES del INSERT (no al revés): sin transacción explícita
// entre ambas escrituras, si UNA de las dos fallara preferimos que sea el
// registro de auditoría el que falte, no la exclusión del cobro — la
// garantía financiera (no cobrar una línea anulada) importa más que la
// completitud del histórico. Si el UPDATE fallara, se aborta antes de tocar
// nada más (no queda una fila de auditoría "huérfana" sobre un original que
// en realidad no cambió de estado).
//
// El propio UPDATE (marca `status: "anulado"` en el original) es también lo
// que hace que la guarda de arriba ("no anular una anulación") bloquee
// anular DOS VECES el mismo ítem: la segunda llamada lee el original ya
// marcado `anulado` por la primera y lo rechaza antes de llegar aquí.
//
// La fila de auditoría copia solo los campos que importan para el
// histórico/cocina/caja (product_id/qty/station_id/order_id/salon_id/
// unit_price_cents/vat_rate), tal como pide el brief. `combo_group` y
// `modifiers_snapshot` NO se copian: es un registro de cantidad/importe, no
// una réplica visual — el modificador/combo ya quedó registrado en la línea
// original, que sigue existiendo (nunca se borra, solo se actualiza su
// `status`).
// ─────────────────────────────────────────────────────────────────────────────

export async function voidOrderItem(input: unknown): Promise<ActionResult<OrderItem>> {
  const parsed = voidOrderItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  const orderError = await assertOrderOpenInSalon(supabase, salonId, parsed.data.orderId);
  if (orderError !== null) return { ok: false, error: orderError };

  const { data: original, error: fetchError } = await supabase
    .from("order_items").select("*")
    .eq("id", parsed.data.itemId).eq("order_id", parsed.data.orderId).eq("salon_id", salonId)
    .maybeSingle();
  if (fetchError !== null) return { ok: false, error: fetchError.message };
  if (original === null) return { ok: false, error: "El ítem no pertenece a tu salón o a ese pedido" };
  if (original.status === "anulado" || original.void_of_item_id !== null) {
    return { ok: false, error: "Esta línea ya está anulada" };
  }

  const { error: updateError } = await supabase
    .from("order_items")
    .update({ status: "anulado", void_reason: parsed.data.reason })
    .eq("id", parsed.data.itemId).eq("salon_id", salonId);
  if (updateError !== null) return { ok: false, error: updateError.message };

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

// ─────────────────────────────────────────────────────────────────────────────
// sendOrderToStations (Task 5): manda a cocina/barra las líneas `pendiente` de
// un pedido — es el "enviar comanda" del mostrador. Un único UPDATE acotado
// por `salon_id` + `order_id` + `status = "pendiente"`: solo mueve las líneas
// que TODAVÍA no se enviaron (si se llama dos veces seguidas, la segunda no
// vuelve a mover nada — `sent` da 0, no es un error). No hay guarda de
// `assertOrderOpenInSalon` explícita porque el propio filtro por `salon_id`
// ya impide tocar líneas de otro salón, y el pedido sigue `abierta`: este
// paso NO cierra ni cobra el pedido, solo adelanta el estado de sus líneas
// para que cocina/barra las vean. `select("id")` es lo mínimo necesario para
// contar cuántas filas afectó el UPDATE — no se necesita la fila completa.
// ─────────────────────────────────────────────────────────────────────────────

export async function sendOrderToStations(input: unknown): Promise<ActionResult<{ sent: number }>> {
  const parsed = sendOrderToStationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  const { data, error } = await supabase
    .from("order_items")
    .update({ status: "enviado" })
    .eq("salon_id", salonId).eq("order_id", parsed.data.orderId).eq("status", "pendiente")
    .select("id");
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/mostrador");
  return { ok: true, data: { sent: (data ?? []).length } };
}

// ─────────────────────────────────────────────────────────────────────────────
// setOrderItemStatus (Task 5): transición de estado de UNA línea (p.ej.
// cocina marca "preparando"→"listo") SEGURA frente a concurrencia — varias
// pantallas (cocina, barra, mostrador) pueden estar mirando el mismo pedido a
// la vez. La seguridad no viene de leer-y-luego-escribir (eso tiene ventana
// de carrera) sino de condicionar el UPDATE por `status = from` EN LA MISMA
// query: si otra pantalla ya movió la línea (o si `from` no coincide con el
// estado real por cualquier otro motivo), el UPDATE afecta 0 filas y eso ES
// la señal de conflicto — no hace falta un SELECT previo para detectarlo.
//
// `data.length === 0` tras el UPDATE condicionado ⇒ CONFLICTO: alguien más ya
// cambió el estado (o la pantalla tenía una copia obsoleta). La UI debe
// recargar y no reintentar ciegamente. Cuando SÍ afecta una fila, `data[0]`
// es la línea ya actualizada — se devuelve completa (`select("*")`) porque el
// caller (kanban de cocina/barra) necesita pintarla tal cual quedó, no solo
// confirmar el cambio.
// ─────────────────────────────────────────────────────────────────────────────

export async function setOrderItemStatus(input: unknown): Promise<ActionResult<OrderItem>> {
  const parsed = setOrderItemStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  const { data, error } = await supabase
    .from("order_items")
    .update({ status: parsed.data.to })
    .eq("id", parsed.data.itemId).eq("salon_id", salonId).eq("status", parsed.data.from)
    .select("*");
  if (error !== null) return { ok: false, error: error.message };
  // Destructuring (no `data[0]`) para que TS narrowe sin `!`: con
  // `noUncheckedIndexedAccess`, `data[0]` seguiría tipando `T | undefined`
  // aunque ya hubiéramos comprobado `data.length > 0` en la línea de arriba.
  const [updated] = data ?? [];
  if (updated === undefined) return { ok: false, error: "CONFLICTO: el estado ya cambió" };
  revalidatePath("/mostrador");
  return { ok: true, data: updated };
}
