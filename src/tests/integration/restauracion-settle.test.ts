/**
 * Test de integración de `settleOrder` (Task 6 del plan de restauración): la
 * pieza que MATERIALIZA un `pos_sale` a partir de un pedido de mostrador,
 * replicando el patrón de `createSale` (TPV) — cabecera + líneas + pagos, con
 * rollback manual si un paso falla (ver `mostrador/actions.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));

import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";

import { settleOrder } from "@/app/(dashboard)/mostrador/actions";

beforeEach(() => {
  holder.supabase = null;
});

// `settleOrderSchema` exige `.uuid()` en `orderId` (transcrito verbatim del
// brief) — el id de ejemplo del brief ("O1") no es un uuid válido y no pasaría
// `safeParse`. Se usa un uuid real aquí, MISMA estructura/aserciones que el
// brief (precedente: `restauracion-order-actions.test.ts`, mismo motivo).
const ORDER_ID = "11111111-1111-4111-8111-111111111111";

describe("settleOrder", () => {
  it("materializa un pos_sale desde el pedido", async () => {
    holder.supabase = makeSupabaseMock({
      tables: {
        orders: { data: [{ id: ORDER_ID, salon_id: "SALON", status: "abierta" }] },
        order_items: {
          data: [
            {
              id: "i1",
              salon_id: "SALON",
              order_id: ORDER_ID,
              product_id: "p1",
              qty: 2,
              unit_price_cents: 880,
              vat_rate: 10,
              status: "enviado",
              void_of_item_id: null,
              modifiers_snapshot: [],
              products: { name: "Hamburguesa" },
            },
          ],
        },
        pos_sessions: { data: [{ id: "SESS1" }] },
        pos_sales: { data: [] },
      },
      onWrite: (op: string, table: string) =>
        op === "insert" && table === "pos_sales" ? { data: [{ id: "S1" }] } : {},
    });

    const r = await settleOrder({
      orderId: ORDER_ID,
      tenders: [{ method: "efectivo", amountCents: 1760, paymentMethodId: null }],
      sendPending: true,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.saleId).toBe("S1");
      expect(r.data.totalCents).toBe(1760);
    }
  });
});
