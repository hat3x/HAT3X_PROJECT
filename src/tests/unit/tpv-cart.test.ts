/**
 * Tests unitarios de los helpers PUROS del carrito de caja (`tpv/cart`).
 *
 * Cubre el parseo tolerante de importes/cantidades (campos de formulario en
 * euros como texto) y el cálculo de totales del ticket, que delega en la capa
 * de pagos. Sin React ni red: solo estado local y aritmética de dominio.
 */
import { describe, it, expect } from "vitest";

import {
  centsToEuroInput,
  computeTicketTotals,
  isLineComplete,
  lineFromProduct,
  lineFromService,
  parseEuroToCents,
  parseQuantity,
  type TicketLine,
} from "@/app/(dashboard)/tpv/cart";
import type { Product, Service } from "@/types/database";

function line(overrides: Partial<TicketLine>): TicketLine {
  return {
    localId: "x",
    kind: "manual",
    refId: null,
    description: "Concepto",
    quantity: "1",
    unitPrice: "10,00",
    vatRate: "21",
    ...overrides,
  };
}

describe("parseEuroToCents", () => {
  it("convierte euros con coma o punto a céntimos enteros", () => {
    expect(parseEuroToCents("12,50")).toBe(1250);
    expect(parseEuroToCents("12.50")).toBe(1250);
    expect(parseEuroToCents("0")).toBe(0);
  });

  it("devuelve null ante entradas inválidas o a medio escribir", () => {
    expect(parseEuroToCents("")).toBeNull();
    expect(parseEuroToCents("12,")).toBeNull();
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("1,234")).toBeNull(); // más de 2 decimales
  });
});

describe("parseQuantity", () => {
  it("acepta enteros y fracciones positivas", () => {
    expect(parseQuantity("1")).toBe(1);
    expect(parseQuantity("0,5")).toBe(0.5);
  });

  it("rechaza cero, negativos y texto", () => {
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
  });
});

describe("centsToEuroInput", () => {
  it("formatea céntimos como euros con coma (ida y vuelta)", () => {
    expect(centsToEuroInput(1250)).toBe("12,50");
    expect(parseEuroToCents(centsToEuroInput(999))).toBe(999);
  });
});

describe("isLineComplete", () => {
  it("exige descripción, cantidad y precio válidos", () => {
    expect(isLineComplete(line({}))).toBe(true);
    expect(isLineComplete(line({ description: "  " }))).toBe(false);
    expect(isLineComplete(line({ quantity: "0" }))).toBe(false);
    expect(isLineComplete(line({ unitPrice: "" }))).toBe(false);
  });
});

describe("computeTicketTotals", () => {
  it("ignora líneas incompletas y no revienta", () => {
    const totals = computeTicketTotals([
      line({ localId: "a", quantity: "", unitPrice: "10,00" }), // incompleta
      line({ localId: "b", quantity: "1", unitPrice: "12,10", vatRate: "21" }),
    ]);
    // Solo la línea "b" cuenta: bruto 1210, base+IVA === bruto.
    expect(totals.totalCents).toBe(1210);
    expect(totals.subtotalCents + totals.taxCents).toBe(totals.totalCents);
  });

  it("agrega varias líneas y desglosa el IVA por tipo", () => {
    const totals = computeTicketTotals([
      line({ localId: "a", quantity: "1", unitPrice: "21,00", vatRate: "21" }),
      line({ localId: "b", quantity: "2", unitPrice: "5,50", vatRate: "10" }),
    ]);
    expect(totals.totalCents).toBe(2100 + 1100);
    expect(totals.vatBreakdown.map((v) => v.vatRate)).toEqual([21, 10]);
  });

  it("una lista vacía suma cero", () => {
    const totals = computeTicketTotals([]);
    expect(totals.totalCents).toBe(0);
    expect(totals.vatBreakdown).toEqual([]);
    expect(totals.couponDiscountCents).toBe(0);
    expect(totals.couponPercentOff).toBeNull();
  });
});

describe("computeTicketTotals con cupón de bienvenida", () => {
  it("aplica el cupón como descuento COHERENTE (base + IVA === total)", () => {
    const totals = computeTicketTotals(
      [line({ unitPrice: "10,00", vatRate: "21" })],
      10,
    );
    expect(totals.grossTotalCents).toBe(1000); // bruto antes del cupón
    expect(totals.couponPercentOff).toBe(10);
    expect(totals.couponDiscountCents).toBe(100); // 10% de 1000
    expect(totals.totalCents).toBe(900); // total ya descontado (no un parche)
    expect(totals.subtotalCents + totals.taxCents).toBe(totals.totalCents);
  });

  it("sin cupón (o null) no descuenta nada — retirar el cupón = no pasar %", () => {
    const conCupon = computeTicketTotals([line({ unitPrice: "10,00" })], 10);
    expect(conCupon.totalCents).toBe(900);
    const retirado = computeTicketTotals([line({ unitPrice: "10,00" })], null);
    expect(retirado.couponPercentOff).toBeNull();
    expect(retirado.couponDiscountCents).toBe(0);
    expect(retirado.totalCents).toBe(1000);
  });

  it("un ticket a cero con cupón no descuenta (no hay sobre qué aplicar)", () => {
    const totals = computeTicketTotals([], 10);
    expect(totals.totalCents).toBe(0);
    expect(totals.couponDiscountCents).toBe(0);
    expect(totals.couponPercentOff).toBeNull();
  });

  it("reparte el descuento entre varios tipos de IVA sin descuadrar", () => {
    const totals = computeTicketTotals(
      [
        line({ localId: "a", unitPrice: "10,00", vatRate: "21" }),
        line({ localId: "b", unitPrice: "5,00", vatRate: "10" }),
      ],
      10,
    );
    expect(totals.grossTotalCents).toBe(1500);
    expect(totals.couponDiscountCents).toBe(150);
    expect(totals.totalCents).toBe(1350);
    expect(totals.subtotalCents + totals.taxCents).toBe(totals.totalCents);
    expect(totals.vatBreakdown.map((v) => v.vatRate)).toEqual([21, 10]);
    for (const entry of totals.vatBreakdown) {
      expect(entry.baseCents + entry.taxCents).toBe(entry.grossCents);
    }
  });
});

describe("lineFromService / lineFromProduct", () => {
  it("prellena una línea de servicio con IVA general", () => {
    const service = { id: "s1", name: "Corte", price_cents: 2000 } as Service;
    const result = lineFromService(service);
    expect(result).toMatchObject({
      kind: "service",
      refId: "s1",
      description: "Corte",
      quantity: "1",
      unitPrice: "20,00",
      vatRate: "21",
    });
  });

  it("prellena una línea de producto con su propio IVA", () => {
    const product = {
      id: "p1",
      name: "Champú",
      price_cents: 850,
      vat_rate: 10,
    } as Product;
    const result = lineFromProduct(product);
    expect(result).toMatchObject({
      kind: "product",
      refId: "p1",
      description: "Champú",
      unitPrice: "8,50",
      vatRate: "10",
    });
  });
});
