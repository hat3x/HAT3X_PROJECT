/**
 * Tests unitarios del cálculo de totales e IVA (`@/lib/payments` → totals/money).
 *
 * Cubre la lógica crítica que comparten CAJA y FACTURACIÓN:
 *   · modelo de precio BRUTO (PVP, IVA incluido): la base y la cuota se extraen.
 *   · invariante de céntimos enteros y la identidad base + IVA === bruto.
 *   · agregación de venta: subtotal + tax === total, y desglose de IVA por tipo.
 *   · redondeo comercial y saturación de descuentos.
 *
 * Es pura aritmética de dominio: se prueba directamente, sin BD ni UI.
 */
import { describe, it, expect } from "vitest";

import {
  computeLineTotals,
  computeSaleTotals,
  multiplyCents,
  roundHalfAwayFromZero,
  splitVatFromGross,
  type SaleLineInput,
} from "@/lib/payments";

describe("money — primitivas de céntimos", () => {
  it("redondea half away from zero corrigiendo el ruido binario", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    // 1005 * 0,001 = 1,005 que en IEEE-754 cae por debajo; debe subir a 1.
    expect(roundHalfAwayFromZero(1.005 * 1000 - 1004)).toBe(1);
  });

  it("multiplyCents admite cantidades fraccionarias (venta por peso)", () => {
    expect(multiplyCents(1000, 2)).toBe(2000);
    expect(multiplyCents(999, 1.5)).toBe(1499); // 1498,5 → 1499
    expect(multiplyCents(0, 3)).toBe(0);
  });

  it("multiplyCents rechaza cantidades no válidas y precios no enteros", () => {
    expect(() => multiplyCents(1000, -1)).toThrow();
    expect(() => multiplyCents(10.5, 2)).toThrow();
  });

  it("splitVatFromGross extrae base + cuota de un bruto (base + tax === bruto)", () => {
    const { baseCents, taxCents } = splitVatFromGross(2000, 21); // 20,00 € con IVA 21%
    expect(baseCents).toBe(1653); // 20,00 / 1,21 = 16,528… → 16,53 €
    expect(taxCents).toBe(347);
    expect(baseCents + taxCents).toBe(2000);
  });

  it("splitVatFromGross con IVA 0 deja toda la base y cuota cero", () => {
    expect(splitVatFromGross(2000, 0)).toEqual({ baseCents: 2000, taxCents: 0 });
  });
});

describe("computeLineTotals — importes de una línea", () => {
  it("línea simple sin descuento (IVA 21% por defecto)", () => {
    const t = computeLineTotals({ quantity: 1, unitPriceCents: 2000 });
    expect(t.grossCents).toBe(2000);
    expect(t.baseCents).toBe(1653);
    expect(t.taxCents).toBe(347);
    expect(t.baseCents + t.taxCents).toBe(t.grossCents);
    expect(t.vatRate).toBe(21);
  });

  it("aplica cantidad y descuento sobre el bruto", () => {
    const t = computeLineTotals({
      quantity: 3,
      unitPriceCents: 1000,
      discountCents: 500,
    });
    expect(t.grossBeforeDiscountCents).toBe(3000);
    expect(t.discountCents).toBe(500);
    expect(t.grossCents).toBe(2500);
    expect(t.baseCents + t.taxCents).toBe(2500);
  });

  it("satura el descuento al bruto previo (nunca deja la línea negativa)", () => {
    const t = computeLineTotals({
      quantity: 1,
      unitPriceCents: 1000,
      discountCents: 5000,
    });
    expect(t.discountCents).toBe(1000);
    expect(t.grossCents).toBe(0);
    expect(t.taxCents).toBe(0);
  });

  it("respeta un tipo de IVA reducido", () => {
    const t = computeLineTotals({ quantity: 1, unitPriceCents: 1100, vatRate: 10 });
    expect(t.baseCents).toBe(1000); // 11,00 / 1,10 = 10,00 €
    expect(t.taxCents).toBe(100);
  });

  it("rechaza cantidades ≤ 0 y precios negativos", () => {
    expect(() => computeLineTotals({ quantity: 0, unitPriceCents: 100 })).toThrow();
    expect(() => computeLineTotals({ quantity: 1, unitPriceCents: -1 })).toThrow();
  });
});

describe("computeSaleTotals — agregación de la venta", () => {
  const lines: SaleLineInput[] = [
    { quantity: 1, unitPriceCents: 2000, vatRate: 21 }, // servicio
    { quantity: 2, unitPriceCents: 550, vatRate: 21 }, // producto x2
    { quantity: 1, unitPriceCents: 1100, vatRate: 10 }, // tipo reducido
  ];

  it("suma subtotal + tax === total y arrastra descuentos", () => {
    const totals = computeSaleTotals(lines);
    expect(totals.subtotalCents + totals.taxCents).toBe(totals.totalCents);
    expect(totals.totalCents).toBe(2000 + 1100 + 1100);
    expect(totals.discountCents).toBe(0);
  });

  it("agrupa el desglose de IVA por tipo, ordenado de mayor a menor", () => {
    const totals = computeSaleTotals(lines);
    expect(totals.vatBreakdown.map((v) => v.vatRate)).toEqual([21, 10]);
    const iva21 = totals.vatBreakdown.find((v) => v.vatRate === 21)!;
    expect(iva21.grossCents).toBe(3100); // 2000 + 2*550
    expect(iva21.baseCents + iva21.taxCents).toBe(iva21.grossCents);
    const iva10 = totals.vatBreakdown.find((v) => v.vatRate === 10)!;
    expect(iva10).toEqual({ vatRate: 10, baseCents: 1000, taxCents: 100, grossCents: 1100 });
  });

  it("una venta sin líneas suma cero y no tiene desglose", () => {
    const totals = computeSaleTotals([]);
    expect(totals).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
      vatBreakdown: [],
    });
  });
});
