import { describe, it, expect } from "vitest";
import { buildOrderItemDrafts, buildSettleLines, settleTotals } from "@/lib/restauracion/order";

let n = 0;
const newId = () => `id-${++n}`;

describe("buildOrderItemDrafts", () => {
  it("producto simple con modificadores → 1 draft con precio efectivo", () => {
    n = 0;
    const drafts = buildOrderItemDrafts({
      productId: "p1", name: "Hamburguesa", basePriceCents: 800, vatRate: 10,
      stationId: "cocina", isCombo: false, qty: 2,
      modifiers: [{ name: "Extra bacon", priceDeltaCents: 80 }], comboPieces: [],
    }, newId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ productId: "p1", qty: 2, unitPriceCents: 880, stationId: "cocina", comboGroup: null });
  });

  it("combo → cabecera con precio + piezas a 0 con su estación y comboGroup común", () => {
    n = 0;
    const drafts = buildOrderItemDrafts({
      productId: "combo1", name: "Menú", basePriceCents: 1000, vatRate: 10,
      stationId: "cocina", isCombo: true, qty: 1, modifiers: [],
      comboPieces: [
        { componentProductId: "food", qty: 1, stationId: "cocina", stationOverrideId: null },
        { componentProductId: "drink", qty: 1, stationId: "cocina", stationOverrideId: "barra" },
      ],
    }, newId);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]!.unitPriceCents).toBe(1000);
    const group = drafts[0]!.comboGroup;
    expect(group).not.toBeNull();
    expect(drafts.every((d) => d.comboGroup === group)).toBe(true);
    expect(drafts[1]!.unitPriceCents).toBe(0);
    expect(drafts[2]!.stationId).toBe("barra");
  });
});

describe("buildSettleLines + settleTotals", () => {
  it("una línea por ítem con nombre+modificadores; base+IVA==bruto", () => {
    const lines = buildSettleLines([
      { productName: "Hamburguesa", qty: 2, unitPriceCents: 880, vatRate: 10,
        modifiersSnapshot: [{ name: "Extra bacon" }] },
    ]);
    expect(lines[0]!.description).toContain("Hamburguesa");
    expect(lines[0]!.description).toContain("Extra bacon");
    const totals = settleTotals(lines);
    expect(totals.subtotalCents + totals.taxCents).toBe(totals.totalCents);
    expect(totals.totalCents).toBe(1760);
  });
});
