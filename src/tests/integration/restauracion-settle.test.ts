/**
 * Test de integración de `settleOrder` (Task 6 del plan de restauración): la
 * pieza que MATERIALIZA un `pos_sale` a partir de un pedido de mostrador,
 * replicando el patrón de `createSale` (TPV) — cabecera + líneas + pagos, con
 * rollback manual si un paso falla (ver `mostrador/actions.ts`).
 *
 * Ronda de fix (Critical + Important + Minor): además del happy-path, cubre
 * el fail-fast de cobertura de pagos (Critical) y el backstop de idempotencia
 * en BD ante una carrera de dos requests (Important, índice único parcial
 * `pos_sales_order_id_unique`, migración 20260810110000).
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

/** Pedido abierto con una línea: 2 × 880c (IVA 10%) = 1760c de total. */
function orderTables() {
  return {
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
  };
}

describe("settleOrder", () => {
  it("materializa un pos_sale desde el pedido", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { ...orderTables(), pos_sales: { data: [] } },
      onWrite: (op: string, table: string) =>
        op === "insert" && table === "pos_sales" ? { data: [{ id: "S1" }] } : {},
    });

    // Tenders suman EXACTO el total (1760c) — el fix Critical de cobertura no
    // debe romper el happy-path.
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

  it("(Critical) rechaza el cobro si los pagos no cubren el total, sin crear la venta", async () => {
    let saleInsertCalled = false;
    holder.supabase = makeSupabaseMock({
      tables: { ...orderTables(), pos_sales: { data: [] } },
      onWrite: (op: string, table: string) => {
        if (op === "insert" && table === "pos_sales") saleInsertCalled = true;
        return {};
      },
    });

    // El total del pedido es 1760c; se paga de menos (1000c) a propósito.
    const r = await settleOrder({
      orderId: ORDER_ID,
      tenders: [{ method: "efectivo", amountCents: 1000, paymentMethodId: null }],
      sendPending: false,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Los pagos no cubren el total del pedido");
    // Fail-fast: no se llegó a escribir nada en `pos_sales`.
    expect(saleInsertCalled).toBe(false);
  });

  it("(Important) backstop 23505: si el insert de pos_sales choca con el índice único, relee la venta ganadora de la carrera", async () => {
    // Simula la carrera: en el momento del INSERT no hay fila todavía (el
    // fast-path del paso 2 no ve nada), pero el propio INSERT choca con
    // `pos_sales_order_id_unique` porque OTRO request ya insertó la venta un
    // instante antes. `posSalesData` es mutable: el `onWrite` del insert la
    // "aterriza" en el momento del choque, y el getter de `tables.pos_sales`
    // hace que la relectura posterior (dentro de `settleOrder`) SÍ la vea.
    let posSalesData: Array<{ id: string; order_id: string; salon_id: string; total_cents: number }> = [];
    holder.supabase = makeSupabaseMock({
      tables: {
        ...orderTables(),
        get pos_sales() {
          return { data: posSalesData };
        },
      },
      onWrite: (op: string, table: string) => {
        if (op === "insert" && table === "pos_sales") {
          posSalesData = [
            { id: "S-RACE", order_id: ORDER_ID, salon_id: "SALON", total_cents: 1760 },
          ];
          return {
            error: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "pos_sales_order_id_unique"',
            },
          };
        }
        return {};
      },
    });

    const r = await settleOrder({
      orderId: ORDER_ID,
      tenders: [{ method: "efectivo", amountCents: 1760, paymentMethodId: null }],
      sendPending: false,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.saleId).toBe("S-RACE");
      expect(r.data.totalCents).toBe(1760);
    }
  });
});
