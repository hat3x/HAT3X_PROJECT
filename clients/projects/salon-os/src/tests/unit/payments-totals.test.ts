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
  applyVatExemption,
  computeLineTotals,
  computeSaleTotals,
  distributeProportionally,
  multiplyCents,
  prorateDiscountAcrossLines,
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

describe("distributeProportionally — reparto por mayor resto", () => {
  it("reparte proporcionalmente cuando divide exacto", () => {
    expect(distributeProportionally(150, [1000, 500])).toEqual([100, 50]);
  });

  it("asigna el céntimo sobrante a la cesta de mayor resto (desempate por índice)", () => {
    // 3 entre pesos iguales: 1 y 1 con resto idéntico → el sobrante va al primero.
    expect(distributeProportionally(3, [500, 500])).toEqual([2, 1]);
  });

  it("la suma del reparto es SIEMPRE exactamente el importe (no pierde céntimos)", () => {
    const weights = [333, 667, 1000, 1];
    for (const amount of [0, 1, 2, 7, 99, 100, 1234, 1999]) {
      const parts = distributeProportionally(amount, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(amount);
      parts.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    }
  });

  it("con importe 0 o pesos que suman 0 devuelve todo ceros", () => {
    expect(distributeProportionally(0, [10, 20])).toEqual([0, 0]);
    expect(distributeProportionally(0, [0, 0])).toEqual([0, 0]);
  });

  it("una cesta de peso 0 nunca recibe céntimos", () => {
    const parts = distributeProportionally(10, [0, 100]);
    expect(parts[0]).toBe(0);
    expect(parts[1]).toBe(10);
  });

  it("rechaza importes/pesos no enteros o negativos", () => {
    expect(() => distributeProportionally(10.5, [1])).toThrow();
    expect(() => distributeProportionally(-1, [1])).toThrow();
    expect(() => distributeProportionally(10, [1, -2])).toThrow();
    expect(() => distributeProportionally(10, [1, 2.5])).toThrow();
  });
});

describe("prorateDiscountAcrossLines — descuento de ticket coherente", () => {
  const lines: SaleLineInput[] = [
    { quantity: 1, unitPriceCents: 1000, vatRate: 21 }, // bruto 1000
    { quantity: 1, unitPriceCents: 500, vatRate: 10 }, //  bruto 500
  ];

  it("prorratea el descuento manteniendo base + IVA === total y Σ bruto === total", () => {
    const discounted = computeSaleTotals(prorateDiscountAcrossLines(lines, 150));
    // 1500 − 150 = 1350; la identidad contable se conserva EXACTA en céntimos.
    expect(discounted.totalCents).toBe(1350);
    expect(discounted.subtotalCents + discounted.taxCents).toBe(discounted.totalCents);
    // El descuento total se arrastra como agregado informativo.
    expect(discounted.discountCents).toBe(150);
    // Se reparte por tipo de IVA (21 y 10 siguen presentes y cuadrados).
    for (const entry of discounted.vatBreakdown) {
      expect(entry.baseCents + entry.taxCents).toBe(entry.grossCents);
    }
    expect(
      discounted.vatBreakdown.reduce((acc, e) => acc + e.grossCents, 0),
    ).toBe(discounted.totalCents);
  });

  it("un descuento indivisible no pierde ni inventa céntimos entre líneas", () => {
    const odd: SaleLineInput[] = [
      { quantity: 1, unitPriceCents: 500, vatRate: 21 },
      { quantity: 1, unitPriceCents: 500, vatRate: 21 },
    ];
    const prorated = prorateDiscountAcrossLines(odd, 3); // 3 céntimos entre dos
    const sumShares = prorated.reduce((acc, l) => acc + (l.discountCents ?? 0), 0);
    expect(sumShares).toBe(3);
    const discounted = computeSaleTotals(prorated);
    expect(discounted.totalCents).toBe(997); // 1000 − 3
    expect(discounted.subtotalCents + discounted.taxCents).toBe(997);
  });

  it("satura el descuento al bruto total (nunca deja el ticket en negativo)", () => {
    const discounted = computeSaleTotals(prorateDiscountAcrossLines(lines, 999_999));
    expect(discounted.totalCents).toBe(0);
    expect(discounted.taxCents).toBe(0);
    expect(discounted.subtotalCents).toBe(0);
  });

  it("descuento 0 devuelve las líneas equivalentes (sin descuento)", () => {
    const prorated = prorateDiscountAcrossLines(lines, 0);
    expect(computeSaleTotals(prorated).totalCents).toBe(1500);
    prorated.forEach((l) => expect(l.discountCents ?? 0).toBe(0));
  });

  it("no muta las líneas de entrada", () => {
    const snapshot = JSON.parse(JSON.stringify(lines));
    prorateDiscountAcrossLines(lines, 150);
    expect(lines).toEqual(snapshot);
  });

  it("rechaza descuentos negativos o no enteros", () => {
    expect(() => prorateDiscountAcrossLines(lines, -1)).toThrow();
    expect(() => prorateDiscountAcrossLines(lines, 1.5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyVatExemption — operación exenta de IVA
//
// El caso real (Biodental): hay pacientes cuya factura debe salir SIN IVA. En
// Kairos los precios son BRUTOS (llevan el IVA dentro), y de ahí la sutileza
// que fija este bloque: exento NO significa que el paciente pague menos.
//
// Una corona de 290 € sigue costando 290 €. Lo que cambia es que esos 290 €
// pasan a ser base imponible entera con cuota 0, en vez de 239,67 + 50,33.
// Si "quitar el IVA" bajara el total, la clínica se estaría regalando el 21 %
// de cada trabajo exento, que es justo lo contrario de lo que se pide.
// ---------------------------------------------------------------------------

describe("applyVatExemption", () => {
  const LINEAS: SaleLineInput[] = [
    { quantity: 1, unitPriceCents: 29000, vatRate: 21 },
    { quantity: 2, unitPriceCents: 9000, vatRate: 10 },
  ];

  it("el total que paga el paciente NO cambia", () => {
    const antes = computeSaleTotals(LINEAS);
    const despues = computeSaleTotals(applyVatExemption(LINEAS));

    expect(despues.totalCents).toBe(antes.totalCents);
  });

  it("la cuota de IVA pasa a cero", () => {
    const t = computeSaleTotals(applyVatExemption(LINEAS));

    expect(t.taxCents).toBe(0);
  });

  it("toda la base imponible es el total: 290 € siguen siendo 290 €", () => {
    const t = computeSaleTotals(applyVatExemption(LINEAS));

    expect(t.subtotalCents).toBe(t.totalCents);
    expect(t.subtotalCents).toBe(29000 + 18000);
  });

  it("el desglose queda en un unico tipo, el 0 %", () => {
    const t = computeSaleTotals(applyVatExemption(LINEAS));

    expect(t.vatBreakdown).toHaveLength(1);
    expect(t.vatBreakdown[0]?.vatRate).toBe(0);
    expect(t.vatBreakdown[0]?.taxCents).toBe(0);
  });

  it("respeta los descuentos de linea: solo toca el tipo de IVA", () => {
    const conDto: SaleLineInput[] = [
      { quantity: 1, unitPriceCents: 29000, vatRate: 21, discountCents: 5000 },
    ];
    const t = computeSaleTotals(applyVatExemption(conDto));

    expect(t.discountCents).toBe(5000);
    expect(t.totalCents).toBe(24000);
    expect(t.subtotalCents).toBe(24000);
  });

  it("no muta las lineas originales", () => {
    const originales: SaleLineInput[] = [{ quantity: 1, unitPriceCents: 29000, vatRate: 21 }];
    applyVatExemption(originales);

    expect(originales[0]?.vatRate).toBe(21);
  });

  it("una linea sin vatRate (que por defecto es 21) tambien queda exenta", () => {
    const t = computeSaleTotals(applyVatExemption([{ quantity: 1, unitPriceCents: 10000 }]));

    expect(t.taxCents).toBe(0);
    expect(t.totalCents).toBe(10000);
  });

  it("sin lineas devuelve una lista vacia", () => {
    expect(applyVatExemption([])).toEqual([]);
  });
});
