import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { createOrder, addOrderItems } from "@/app/(dashboard)/mostrador/actions";

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
});
