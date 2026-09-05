"use server";
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { computeLineTotals, sumTenders } from "@/lib/payments";
import { buildSettleLines, settleTotals } from "@/lib/restauracion/order";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  addOrderItemsSchema,
  createOrderSchema,
  sendOrderToStationsSchema,
  setOrderItemStatusSchema,
  settleOrderSchema,
  voidOrderItemSchema,
} from "@/lib/validations/order";
import type { Order, OrderItem, OrderItemInsert, TablesInsert } from "@/types/database";

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
//
// `'anulado'` es TERMINAL — fix de la revisión final del Plan B (Important,
// financiero). Solo `voidOrderItem` puede fijarlo (append-only: UPDATE del
// original a `anulado` + INSERT de la fila de auditoría con
// `void_of_item_id`). Sin esta guarda, `setOrderItemStatus({ from:'anulado',
// to:'pendiente' })` casaría con una línea ya anulada (el UPDATE condicionado
// por `status = from` no distingue "anulado por buena razón" de cualquier
// otro estado), le quitaría `status:'anulado'` dejando `void_of_item_id` sin
// tocar (huérfano, apuntando a una línea que ya no dice estar anulada), y
// `settleOrder` (que filtra `status != 'anulado'`) la re-incluiría y la
// COBRARÍA otra vez — doble cobro de una línea que el mostrador ya anuló.
// Se rechaza ANTES de tocar la BD (ni siquiera se llega al UPDATE) tanto para
// `from:'anulado'` (reanimar una anulación) como para `to:'anulado'`
// (anular por esta vía, saltándose el registro de auditoría de
// `voidOrderItem`) — ambos sentidos abren el mismo agujero financiero.
// ─────────────────────────────────────────────────────────────────────────────

export async function setOrderItemStatus(input: unknown): Promise<ActionResult<OrderItem>> {
  const parsed = setOrderItemStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  if (parsed.data.from === "anulado" || parsed.data.to === "anulado") {
    return { ok: false, error: "No se puede transicionar hacia/desde 'anulado' (usa anular la línea)" };
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// settleOrder (Task 6): cobra un pedido de mostrador MATERIALIZANDO un
// `pos_sale` — es el puente entre "restauración" (pedidos/comandas) y "TPV"
// (caja/facturación): un pedido no se factura hasta que pasa por aquí. La
// estructura replica `createSale` (tpv/actions.ts) a propósito: misma cabecera
// `pos_sales` (status "completed", `session_id` de la caja abierta), mismas
// líneas `pos_sale_lines` y mismos pagos `pos_payments`, con el MISMO patrón
// de rollback manual — supabase-js no expone transacciones multi-sentencia
// desde el cliente, así que un fallo posterior a crear la cabecera se COMPENSA
// borrándola (el `on delete cascade` de las FKs arrastra líneas y pagos). La
// diferencia frente a `createSale`: aquí las líneas NO las teclea el cajero
// (vienen del pedido ya tomado) y el cobro no pasa por `getPaymentGateway` —
// los tenders ya vienen resueltos en céntimos desde el flujo de cobro de
// mostrador, se insertan directo en `pos_payments`. SÍ se replica, a mano, la
// validación de cobertura de la pasarela (`assertTendersCoverTotal`: Σ tenders
// === totalCents EXACTO) justo después de calcular los totales — ver ese
// bloque más abajo.
//
// ── Idempotencia (fast-path + backstop en BD) ─────────────────────────────────
// Cobrar el MISMO pedido dos veces (doble tap en el botón de cobrar, reintento
// de red) NO debe crear una segunda venta. La guarda de aplicación comprueba,
// en este orden: (1) si YA existe un `pos_sales` con `order_id = orderId` en
// este salón, esa es la fuente autoritativa — se devuelve tal cual, sin volver
// a cobrar; (2) si no hay venta pero el pedido YA está `status = "cobrada"`,
// es un estado inconsistente (no debería poder pasar salvo un fallo entre el
// UPDATE de `orders` y la lectura) y se informa en vez de cobrar a ciegas una
// segunda vez. El caso normal (primera llamada) no entra en ninguna de las dos
// ramas. Solo se cobra un pedido `"abierta"`: si está `"cerrada"`/`"anulada"`
// (o `"cobrada"` con venta encontrada arriba) no se llega a esta comprobación.
//
// Este fast-path es "select-luego-insert", NO atómico (mismo motivo que
// `createOrder`, ver comentario de ese bloque): dos requests concurrentes para
// el MISMO pedido pueden pasar AMBOS el select (ninguno ve todavía la fila del
// otro) y el segundo `insert` de `pos_sales` choca con el índice único parcial
// `pos_sales_order_id_unique` (migración 20260810110000, Postgres `23505`).
// Ese caso se trata como BACKSTOP de idempotencia, no como fallo: se relee la
// venta de ese `order_id` (el otro request ya la insertó) y se devuelve como
// propia — ver el `catch` de `23505` más abajo, junto al insert de `pos_sales`.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila de `pos_sales` mínima para responder en la rama idempotente. */
interface ExistingSaleRow {
  id: string;
  total_cents: number;
}

/** `order_items` con el join `products(name)` que pide `buildSettleLines`. */
interface SettleableOrderItemRow {
  product_id: string;
  qty: number;
  unit_price_cents: number;
  vat_rate: number;
  modifiers_snapshot: unknown;
  products: { name: string } | null;
}

/** `modifiers_snapshot` es `Json` en la BD; en la práctica siempre es esta forma (la escribe `addOrderItems`). */
function asModifiersSnapshot(value: unknown): Array<{ name: string; priceDeltaCents: number }> {
  return Array.isArray(value) ? (value as Array<{ name: string; priceDeltaCents: number }>) : [];
}

export async function settleOrder(
  input: unknown,
): Promise<ActionResult<{ saleId: string; totalCents: number }>> {
  const parsed = settleOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { orderId, tenders, sendPending } = parsed.data;

  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return { ok: false, error: "Sesión no válida" };

  // 1) El pedido debe existir EN ESTE salón (aislamiento multi-tenant, además de RLS).
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,status")
    .eq("id", orderId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (orderError !== null) return { ok: false, error: orderError.message };
  if (order === null) return { ok: false, error: "El pedido no existe o no pertenece a tu salón" };

  // 2) Idempotencia — ver comentario de bloque arriba.
  const { data: existingSaleData, error: existingSaleError } = await supabase
    .from("pos_sales")
    .select("id,total_cents")
    .eq("order_id", orderId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (existingSaleError !== null) return { ok: false, error: existingSaleError.message };
  const existingSale = existingSaleData as ExistingSaleRow | null;
  if (existingSale !== null) {
    return { ok: true, data: { saleId: existingSale.id, totalCents: existingSale.total_cents } };
  }
  if (order.status === "cobrada") {
    return {
      ok: false,
      error: "El pedido ya está cobrado pero no se encontró la venta asociada",
    };
  }
  // Solo se cobra un pedido abierto: un pedido `"cerrada"`/`"anulada"` es un
  // documento cerrado (mismo criterio que `assertOrderOpenInSalon`), no algo
  // pendiente de facturar. `"cobrada"` ya se descartó arriba con su propio
  // mensaje (más específico: venta esperada pero no encontrada).
  if (order.status !== "abierta") {
    return { ok: false, error: "El pedido no está abierto" };
  }

  // 3) Líneas a cobrar: NO anuladas (Task 4 marca el original `status:"anulado"`
  //    al anular, así que basta este filtro — no hace falta excluir por `id`).
  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select("*, products(name)")
    .eq("order_id", orderId)
    .eq("salon_id", salonId)
    .is("void_of_item_id", null)
    .neq("status", "anulado");
  if (itemsError !== null) return { ok: false, error: itemsError.message };
  const items = (itemsData ?? []) as unknown as SettleableOrderItemRow[];
  if (items.length === 0) return { ok: false, error: "El pedido no tiene líneas para cobrar" };

  // 4) Líneas + totales — misma fuente única de verdad que el TPV (`@/lib/payments`).
  const lines = buildSettleLines(
    items.map((it) => ({
      productName: it.products?.name ?? "Producto",
      qty: it.qty,
      unitPriceCents: it.unit_price_cents,
      vatRate: it.vat_rate,
      modifiersSnapshot: asModifiersSnapshot(it.modifiers_snapshot),
    })),
  );
  const totals = settleTotals(lines);

  // (Fix Critical) Los pagos deben cubrir el total EXACTO — mismo criterio que
  // `createSale`/`assertTendersCoverTotal` (Σ tenders === totalCents, ni de
  // menos ni de más; ver `@/lib/payments/gateway.ts`). Fail-fast ANTES de
  // tocar la BD: en este punto no se ha escrito nada todavía (ni `pos_sales`
  // ni nada más), así que no hace falta `rollback()`. Se usa `sumTenders`
  // (reutilizada de `@/lib/payments`, la misma que usa la pasarela) en vez de
  // sumar a mano.
  if (sumTenders(tenders) !== totals.totalCents) {
    return { ok: false, error: "Los pagos no cubren el total del pedido" };
  }

  // 5) Caja abierta del salón (si la hay) — mismo patrón que `createSale`.
  const { data: openSession, error: openSessionError } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("salon_id", salonId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (openSessionError !== null) return { ok: false, error: openSessionError.message };
  const sessionId = (openSession as { id: string } | null)?.id ?? null;

  // 6) Cabecera de la venta, enlazada al pedido de origen (`order_id`).
  const saleInsert: TablesInsert<"pos_sales"> = {
    salon_id: salonId,
    order_id: orderId,
    session_id: sessionId,
    status: "completed",
    subtotal_cents: totals.subtotalCents,
    discount_cents: 0,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    currency: "EUR",
    sold_by: user.id,
  };
  const { data: saleData, error: saleError } = await supabase
    .from("pos_sales")
    .insert(saleInsert)
    .select("id")
    .single();
  if (saleError !== null) {
    // Backstop de idempotencia en BD (índice único parcial
    // `pos_sales_order_id_unique`, migración 20260810110000): si el fast-path
    // del paso 2 NO vio ninguna venta (carrera entre dos requests para el
    // MISMO pedido) pero este INSERT choca con el índice único, NO es un
    // fallo real — es la venta del OTRO request ganando la carrera. Se relee
    // por `order_id`+`salon_id` (la fuente autoritativa) y se devuelve como
    // propia, sin crear una segunda venta ni propagar el error.
    if (saleError.code === "23505") {
      const { data: raceSaleData, error: raceSaleError } = await supabase
        .from("pos_sales")
        .select("id,total_cents")
        .eq("order_id", orderId)
        .eq("salon_id", salonId)
        .maybeSingle();
      if (raceSaleError !== null) return { ok: false, error: raceSaleError.message };
      const raceSale = raceSaleData as ExistingSaleRow | null;
      if (raceSale !== null) {
        return { ok: true, data: { saleId: raceSale.id, totalCents: raceSale.total_cents } };
      }
    }
    return { ok: false, error: saleError.message };
  }
  if (saleData === null) {
    return { ok: false, error: "No se pudo crear la venta" };
  }
  const saleId = (saleData as { id: string }).id;

  // A partir de aquí, cualquier fallo compensa borrando la venta (cascade
  // arrastra líneas y pagos) — mismo patrón que `createSale`.
  async function rollback(): Promise<void> {
    await supabase.from("pos_sales").delete().eq("id", saleId).eq("salon_id", salonId!);
  }

  // 7) Líneas del ticket (snapshot de importes por línea), 1:1 con `items`
  //    (`buildSettleLines` preserva el orden) para poder anotar `product_id`.
  const lineInserts: TablesInsert<"pos_sale_lines">[] = lines.map((line, i) => {
    const sourceItem = items[i]!;
    const lineTotals = computeLineTotals({
      quantity: line.qty,
      unitPriceCents: line.unitPriceCents,
      vatRate: line.vatRate,
    });
    return {
      salon_id: salonId,
      sale_id: saleId,
      product_id: sourceItem.product_id,
      description: line.description,
      quantity: line.qty,
      unit_price_cents: line.unitPriceCents,
      vat_rate: line.vatRate,
      line_total_cents: lineTotals.grossCents,
    };
  });
  const { error: linesError } = await supabase.from("pos_sale_lines").insert(lineInserts);
  if (linesError !== null) {
    await rollback();
    return { ok: false, error: `No se pudieron guardar las líneas: ${linesError.message}` };
  }

  // 8) Cobro — a diferencia de `createSale`, aquí NO se pasa por
  //    `getPaymentGateway`: los tenders ya vienen resueltos en céntimos desde
  //    el flujo de cobro de mostrador (validados por `settleTenderSchema`), se
  //    insertan directo en `pos_payments` (una fila por tender = pago mixto).
  const paymentInserts: TablesInsert<"pos_payments">[] = tenders.map((tender) => ({
    salon_id: salonId,
    sale_id: saleId,
    session_id: sessionId,
    method: tender.method,
    payment_method_id: tender.paymentMethodId,
    amount_cents: tender.amountCents,
    reference: tender.reference ?? null,
  }));
  const { error: paymentsError } = await supabase.from("pos_payments").insert(paymentInserts);
  if (paymentsError !== null) {
    await rollback();
    return { ok: false, error: `No se pudo registrar el cobro: ${paymentsError.message}` };
  }

  // 9) El pedido queda cerrado a facturación: un pedido cobrado es un
  //    documento cerrado (mismo criterio que `assertOrderOpenInSalon`). Si
  //    este UPDATE falla, TAMBIÉN se revierte la venta (`rollback()`, mismo
  //    criterio que los pasos 7/8): dejar `pos_sales`/`pos_sale_lines`/
  //    `pos_payments` creados con el pedido todavía `"abierta"` es peligroso —
  //    la UI seguiría ofreciendo cobrarlo, y un segundo intento (esta vez SÍ
  //    habría fila en `pos_sales`) quedaría bloqueado por el fast-path de
  //    idempotencia del paso 2 sin que el pedido refleje que ya se cobró.
  //    Mejor deshacer la venta entera y que el cajero reintente.
  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({ status: "cobrada" })
    .eq("id", orderId)
    .eq("salon_id", salonId);
  if (orderUpdateError !== null) {
    await rollback();
    return { ok: false, error: orderUpdateError.message };
  }

  // 10) "Pagar primero": si se pidió, las líneas `pendiente` que quedaran se
  //     mandan a cocina/barra ahora que el cobro ya está firme (mismo UPDATE
  //     que `sendOrderToStations`, inline). Best-effort: la venta ya está
  //     cerrada — un fallo aquí no debe revertir ni bloquear la respuesta.
  if (sendPending) {
    await supabase
      .from("order_items")
      .update({ status: "enviado" })
      .eq("salon_id", salonId)
      .eq("order_id", orderId)
      .eq("status", "pendiente");
  }

  revalidatePath("/mostrador");
  return { ok: true, data: { saleId, totalCents: totals.totalCents } };
}
