/**
 * Tests unitarios de los helpers PUROS del arqueo de caja (`arqueo/session-totals`).
 *
 * Cubre la agregación de cobros por método, la suma de efectivo, el cálculo del
 * efectivo esperado y del descuadre (con signo), y el snapshot de cierre. Sin
 * React ni red: solo aritmética de dominio en céntimos enteros.
 */
import { describe, it, expect } from "vitest";

import {
  aggregateByMethod,
  buildClosingTotals,
  computeCashVariance,
  computeExpectedCash,
  sumAllPayments,
  sumCashPayments,
  type SessionPayment,
} from "@/app/(dashboard)/arqueo/session-totals";

/** Cobros de ejemplo de una sesión (importes en céntimos, como en la BD). */
const payments: SessionPayment[] = [
  { method: "efectivo", amount_cents: 5000 },
  { method: "tarjeta", amount_cents: 12000 },
  { method: "efectivo", amount_cents: 2500 },
  { method: "bizum", amount_cents: 800 },
];

describe("aggregateByMethod", () => {
  it("suma por método y respeta el orden canónico", () => {
    expect(aggregateByMethod(payments)).toEqual([
      { method: "efectivo", amountCents: 7500 },
      { method: "tarjeta", amountCents: 12000 },
      { method: "bizum", amountCents: 800 },
    ]);
  });

  it("omite los métodos sin cobros y devuelve [] sin pagos", () => {
    expect(aggregateByMethod([])).toEqual([]);
    const soloTarjeta = aggregateByMethod([
      { method: "tarjeta", amount_cents: 100 },
    ]);
    expect(soloTarjeta).toEqual([{ method: "tarjeta", amountCents: 100 }]);
  });
});

describe("sumas", () => {
  it("sumAllPayments suma todos los métodos", () => {
    expect(sumAllPayments(payments)).toBe(20300);
    expect(sumAllPayments([])).toBe(0);
  });

  it("sumCashPayments suma solo el efectivo", () => {
    expect(sumCashPayments(payments)).toBe(7500);
    expect(
      sumCashPayments([{ method: "tarjeta", amount_cents: 999 }]),
    ).toBe(0);
  });
});

describe("efectivo esperado y descuadre", () => {
  it("esperado = fondo + efectivo cobrado", () => {
    expect(computeExpectedCash(10000, 7500)).toBe(17500);
  });

  it("descuadre = contado − esperado (cuadra)", () => {
    expect(computeCashVariance(17500, 17500)).toBe(0);
  });

  it("descuadre negativo cuando falta dinero", () => {
    expect(computeCashVariance(17000, 17500)).toBe(-500);
  });

  it("descuadre positivo cuando sobra dinero", () => {
    expect(computeCashVariance(18000, 17500)).toBe(500);
  });
});

describe("buildClosingTotals", () => {
  it("produce un snapshot plano por método", () => {
    expect(buildClosingTotals(payments)).toEqual({
      efectivo: 7500,
      tarjeta: 12000,
      bizum: 800,
    });
  });

  it("es un objeto vacío sin cobros", () => {
    expect(buildClosingTotals([])).toEqual({});
  });
});
