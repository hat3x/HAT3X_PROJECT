/**
 * `emitInvoiceAction` sobre una venta que viene de un volcado histórico.
 *
 * Al dar de alta un salón se le puede volcar su histórico de ventas —Espiral entró
 * con 30.358 tickets de cinco años del programa anterior—. Ese histórico aparece en
 * Facturación › Tickets junto a las ventas reales, y cada ticket ofrece "emitir
 * factura".
 *
 * Pulsarlo sobre una venta migrada consumiría un número de la serie correlativa de
 * Kairos para una operación que el salón YA facturó en su sistema anterior: dos
 * documentos fiscales para la misma venta, en series distintas, y el nuevo fechado
 * hoy para algo de hace años. Un número de serie gastado no se recupera sin dejar
 * hueco, así que hay que pararlo antes de emitir, no después.
 *
 * Lo que fija este test:
 *  · una venta con `migrated_from` se rechaza y NO se llega a emitir nada;
 *  · una venta nativa (`migrated_from` null) sigue facturándose igual que siempre
 *    —la guarda no puede convertirse en un freno para el trabajo del día.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  emitInvoice: vi.fn(),
  salon: null as unknown,
  sale: null as unknown,
  lines: [] as unknown[],
}));

vi.mock("@/lib/salon", () => ({
  getActiveSalonId: async () => "00000000-0000-0000-0000-000000000000",
}));

vi.mock("@/lib/invoicing", () => ({
  emitInvoice: (...args: unknown[]) => h.emitInvoice(...args),
  InvoiceEmissionError: class extends Error {},
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => {
  function builder(tabla: string) {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () =>
        tabla === "salons" ? { data: h.salon, error: null } : { data: h.sale, error: null },
      // `pos_sale_lines` se consume sin `maybeSingle`: la cadena se espera tal cual.
      then: (resolve: (v: unknown) => unknown) => resolve({ data: h.lines, error: null }),
    };
    return chain;
  }
  return { createClient: () => ({ from: (tabla: string) => builder(tabla) }) };
});

import { emitInvoiceAction } from "@/app/(dashboard)/tpv/invoice-actions";

const VENTA = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  h.salon = { tax_id: "B12345678", legal_name: "Espiral SL", fiscal_address: "Fuenlabrada" };
  h.lines = [{ quantity: 1, unit_price_cents: 1590, discount_cents: 0, vat_rate: 21 }];
  h.emitInvoice.mockResolvedValue({ id: "f1", number: 1, series: "A" });
});

describe("emitInvoiceAction sobre histórico migrado", () => {
  it("no factura una venta que viene del sistema anterior", async () => {
    h.sale = { id: VENTA, customer_id: null, migrated_from: "AAR:ticket:217176" };

    const result = await emitInvoiceAction({
      invoiceType: "ticket",
      series: "A",
      saleId: VENTA,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/sistema anterior/i);
  });

  it("no llega a gastar un número de serie al rechazarla", async () => {
    h.sale = { id: VENTA, customer_id: null, migrated_from: "AAR:ticket:217176" };

    await emitInvoiceAction({ invoiceType: "ticket", series: "A", saleId: VENTA });

    expect(h.emitInvoice).not.toHaveBeenCalled();
  });

  it("sigue facturando con normalidad una venta nativa de Kairos", async () => {
    h.sale = { id: VENTA, customer_id: null, migrated_from: null };

    const result = await emitInvoiceAction({
      invoiceType: "ticket",
      series: "A",
      saleId: VENTA,
    });

    expect(result.ok).toBe(true);
    expect(h.emitInvoice).toHaveBeenCalledTimes(1);
  });
});
