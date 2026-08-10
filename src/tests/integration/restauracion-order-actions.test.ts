import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { createOrder, addOrderItems, voidOrderItem } from "@/app/(dashboard)/mostrador/actions";

beforeEach(() => { holder.supabase = null; });

// `createOrderSchema`/`addOrderItemsSchema` exigen `.uuid()` en id/orderId/
// itemId/productId (transcritos verbatim del brief) — los ids de ejemplo del
// brief ("O1", "OX", "i1"...) no son UUIDs válidos y no pasarían `safeParse`.
// Se usan uuids reales aquí, con la MISMA estructura/aserciones que el brief.
const ORDER_ID_1 = "11111111-1111-4111-8111-111111111111";
const ORDER_ID_2 = "22222222-2222-4222-8222-222222222222";
const ORDER_ID_X = "33333333-3333-4333-8333-333333333333";
const ITEM_ID_1 = "44444444-4444-4444-8444-444444444444";
const PRODUCT_ID_1 = "55555555-5555-4555-8555-555555555555";

describe("order actions", () => {
  it("createOrder inserta con id de cliente", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { orders: { data: [] } },
      onWrite: (op: string, table: string) =>
        op === "insert" && table === "orders"
          ? { data: [{ id: ORDER_ID_1, salon_id: "SALON", status: "abierta" }] } : {},
    });
    const r = await createOrder({ id: ORDER_ID_1, label: null, idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe(ORDER_ID_1);
  });

  it("createOrder es idempotente por idempotencyKey", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { orders: { data: [{ id: ORDER_ID_1, salon_id: "SALON", idempotency_key: "k1", status: "abierta" }] } },
    });
    const r = await createOrder({ id: ORDER_ID_2, label: null, idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe(ORDER_ID_1);
  });

  it("addOrderItems rechaza pedido de otro salón / inexistente", async () => {
    holder.supabase = makeSupabaseMock({ tables: { orders: { data: [] } } });
    const r = await addOrderItems({ orderId: ORDER_ID_X, items: [
      { id: ITEM_ID_1, productId: PRODUCT_ID_1, qty: 1, unitPriceCents: 500, vatRate: 10, stationId: null, comboGroup: null, modifiersSnapshot: [] },
    ]});
    expect(r.ok).toBe(false);
  });

  // Ronda de fix (Important #2): la idempotencia de `createOrder` ya no
  // depende solo del select previo (fast-path) — si el INSERT choca con el
  // índice único `orders_idempotency_key` (23505, condición de carrera entre
  // dos requests con la misma key), se relee la fila ganadora y se devuelve.
  //
  // `makeSupabaseMock` resuelve `select` leyendo el array de `tables.orders`
  // en el momento de la llamada (no una foto fija) — así que para simular la
  // carrera de verdad (fast-path NO ve nada todavía, pero el re-fetch
  // posterior al 23505 SÍ) se arranca con el array vacío y es el propio
  // `onWrite` del insert quien "aterriza" la fila ganadora en ese array justo
  // antes de devolver el error, imitando al otro request que gana la carrera
  // entre nuestro select y nuestro insert.
  it("createOrder resuelve la fila existente si el insert choca por idempotencyKey (23505)", async () => {
    const ordersData: unknown[] = [];
    holder.supabase = makeSupabaseMock({
      tables: { orders: { data: ordersData } },
      onWrite: (op: string, table: string) => {
        if (op === "insert" && table === "orders") {
          ordersData.push({ id: ORDER_ID_1, salon_id: "SALON", idempotency_key: "k1", status: "abierta" });
          return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        return {};
      },
    });
    const r = await createOrder({ id: ORDER_ID_2, label: null, idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe(ORDER_ID_1);
  });

  // Ronda de fix (Important #1): voidOrderItem debe gatear por estado del
  // pedido igual que addOrderItems — no se puede anular una línea de un
  // pedido que ya no está abierta (p.ej. cobrada).
  it("voidOrderItem rechaza si el pedido no está abierta", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { orders: { data: [{ id: ORDER_ID_1, salon_id: "SALON", status: "cobrada" }] } },
    });
    const r = await voidOrderItem({ orderId: ORDER_ID_1, itemId: ITEM_ID_1, reason: "pedido equivocado" });
    expect(r.ok).toBe(false);
  });

  // Happy path que no existía todavía: pedido abierta + ítem pendiente →
  // inserta la fila de anulación (append-only).
  it("voidOrderItem inserta fila de anulación cuando el pedido está abierta", async () => {
    holder.supabase = makeSupabaseMock({
      tables: {
        orders: { data: [{ id: ORDER_ID_1, salon_id: "SALON", status: "abierta" }] },
        order_items: { data: [{
          id: ITEM_ID_1, salon_id: "SALON", order_id: ORDER_ID_1, product_id: PRODUCT_ID_1,
          qty: 1, unit_price_cents: 500, vat_rate: 10, station_id: null, status: "pendiente",
          combo_group: null, modifiers_snapshot: [], void_of_item_id: null, void_reason: null,
        }] },
      },
      onWrite: (op: string, table: string) =>
        op === "insert" && table === "order_items"
          ? { data: [{
              id: "66666666-6666-4666-8666-666666666666", salon_id: "SALON", order_id: ORDER_ID_1,
              product_id: PRODUCT_ID_1, qty: 1, unit_price_cents: 500, vat_rate: 10, station_id: null,
              status: "anulado", void_of_item_id: ITEM_ID_1, void_reason: "pedido equivocado",
            }] }
          : {},
    });
    const r = await voidOrderItem({ orderId: ORDER_ID_1, itemId: ITEM_ID_1, reason: "pedido equivocado" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe("anulado");
      expect(r.data.void_of_item_id).toBe(ITEM_ID_1);
    }
  });

  // Ronda de fix (Minor #3): no tiene sentido anular una anulación.
  it("voidOrderItem rechaza anular una línea que ya está anulada", async () => {
    holder.supabase = makeSupabaseMock({
      tables: {
        orders: { data: [{ id: ORDER_ID_1, salon_id: "SALON", status: "abierta" }] },
        order_items: { data: [{
          id: ITEM_ID_1, salon_id: "SALON", order_id: ORDER_ID_1, product_id: PRODUCT_ID_1,
          qty: 1, unit_price_cents: 500, vat_rate: 10, station_id: null, status: "anulado",
          combo_group: null, modifiers_snapshot: [], void_of_item_id: "77777777-7777-4777-8777-777777777777",
          void_reason: "ya anulada antes",
        }] },
      },
    });
    const r = await voidOrderItem({ orderId: ORDER_ID_1, itemId: ITEM_ID_1, reason: "otra vez" });
    expect(r.ok).toBe(false);
  });
});
