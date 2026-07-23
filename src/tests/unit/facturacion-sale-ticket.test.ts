/**
 * Detalle y reimpresión de ventas (`@/lib/facturacion/sale-ticket`) — sub-7.
 *
 * Blinda la parte DELICADA del módulo, toda PURA (sin red ni BD):
 *   · `formatSaleRef` — localizador corto y estable de la venta;
 *   · `computeVatBreakdown` — reparto del IVA por tipo que SIEMPRE cuadra al
 *     céntimo con los totales autoritativos de la venta (invariante clave);
 *   · `toSaleDetail` — normalización + orden determinista de líneas y cobros +
 *     resolución de embebidos (sede por venta→sesión→sede);
 *   · `buildSaleTicketData` — reconstrucción de la "foto" imprimible del ticket
 *     (cupón derivado del descuento, cobros como tenders, fidelización a null),
 *     de modo que base + IVA reconcilian con el total realmente cobrado.
 */
import { describe, expect, it } from "vitest";

import {
  buildSaleTicketData,
  computeVatBreakdown,
  formatSaleRef,
  toSaleDetail,
  type RawSaleDetail,
} from "@/lib/facturacion/sale-ticket";

describe("formatSaleRef", () => {
  it("toma el prefijo de 8 caracteres del id en mayúsculas", () => {
    expect(formatSaleRef("abcdef12-3456-7890-abcd-ef1234567890")).toBe("ABCDEF12");
  });

  it("no revienta con ids cortos", () => {
    expect(formatSaleRef("ab12")).toBe("AB12");
  });
});

describe("computeVatBreakdown", () => {
  it("con un único tipo, base y cuota son EXACTAMENTE el snapshot", () => {
    const rows = computeVatBreakdown([{ vatRate: 21, lineTotalCents: 5000 }], 4132, 868);
    expect(rows).toEqual([{ vatRate: 21, baseCents: 4132, taxCents: 868 }]);
  });

  it("agrega varias líneas del mismo tipo antes de repartir", () => {
    const rows = computeVatBreakdown(
      [
        { vatRate: 21, lineTotalCents: 2500 },
        { vatRate: 21, lineTotalCents: 2500 },
      ],
      4132,
      868,
    );
    expect(rows).toEqual([{ vatRate: 21, baseCents: 4132, taxCents: 868 }]);
  });

  it("con varios tipos, la suma de bases y de cuotas cuadra al céntimo con el snapshot", () => {
    const rows = computeVatBreakdown(
      [
        { vatRate: 21, lineTotalCents: 6050 },
        { vatRate: 10, lineTotalCents: 1100 },
      ],
      6000,
      1150,
    );
    // Ordenados por tipo ascendente.
    expect(rows.map((row) => row.vatRate)).toEqual([10, 21]);
    // Invariante: Σ bases === base imponible; Σ cuotas === IVA total (sin descuadre).
    expect(rows.reduce((sum, row) => sum + row.baseCents, 0)).toBe(6000);
    expect(rows.reduce((sum, row) => sum + row.taxCents, 0)).toBe(1150);
  });

  it("sin líneas (o bruto nulo) devuelve un desglose vacío", () => {
    expect(computeVatBreakdown([], 0, 0)).toEqual([]);
    expect(computeVatBreakdown([{ vatRate: 21, lineTotalCents: 0 }], 0, 0)).toEqual([]);
  });
});

/** Venta base de ejemplo (un tipo de IVA, sin descuento) para los tests. */
function baseRawSale(overrides: Partial<RawSaleDetail> = {}): RawSaleDetail {
  return {
    id: "sale-abc12345-6789",
    sold_at: "2026-07-22T18:30:00.000Z",
    status: "completed",
    currency: "EUR",
    subtotal_cents: 4132,
    discount_cents: 0,
    tax_cents: 868,
    total_cents: 5000,
    notes: null,
    professional: { full_name: "Marta" },
    customer: { full_name: "Lucía" },
    session: { location: { name: "Centro" } },
    lines: [
      {
        description: "Corte de caballero",
        quantity: 1,
        unit_price_cents: 2500,
        vat_rate: 21,
        line_total_cents: 2500,
        created_at: "2026-07-22T18:29:00.000Z",
      },
      {
        description: "Peinado",
        quantity: 1,
        unit_price_cents: 2500,
        vat_rate: 21,
        line_total_cents: 2500,
        created_at: "2026-07-22T18:29:30.000Z",
      },
    ],
    payments: [{ method: "tarjeta", amount_cents: 5000, paid_at: "2026-07-22T18:30:05.000Z" }],
    ...overrides,
  };
}

describe("toSaleDetail", () => {
  it("normaliza cabecera, líneas y cobros y deriva el bruto y el desglose", () => {
    const detail = toSaleDetail(baseRawSale());
    expect(detail.locationName).toBe("Centro");
    expect(detail.professionalName).toBe("Marta");
    expect(detail.customerName).toBe("Lucía");
    expect(detail.grossTotalCents).toBe(5000);
    expect(detail.taxableBaseCents).toBe(4132);
    expect(detail.taxCents).toBe(868);
    expect(detail.totalCents).toBe(5000);
    expect(detail.vatBreakdown).toEqual([{ vatRate: 21, baseCents: 4132, taxCents: 868 }]);
    expect(detail.payment).toEqual({ methods: ["tarjeta"], label: "Tarjeta", isMixed: false });
    expect(detail.payments).toEqual([
      { method: "tarjeta", label: "Tarjeta", amountCents: 5000 },
    ]);
  });

  it("ordena las líneas por created_at y los cobros por paid_at (determinista)", () => {
    const detail = toSaleDetail(
      baseRawSale({
        lines: [
          {
            description: "Segunda",
            quantity: 1,
            unit_price_cents: 2500,
            vat_rate: 21,
            line_total_cents: 2500,
            created_at: "2026-07-22T18:29:30.000Z",
          },
          {
            description: "Primera",
            quantity: 1,
            unit_price_cents: 2500,
            vat_rate: 21,
            line_total_cents: 2500,
            created_at: "2026-07-22T18:29:00.000Z",
          },
        ],
        payments: [
          { method: "efectivo", amount_cents: 2000, paid_at: "2026-07-22T18:30:10.000Z" },
          { method: "tarjeta", amount_cents: 3000, paid_at: "2026-07-22T18:30:00.000Z" },
        ],
      }),
    );
    expect(detail.lines.map((line) => line.description)).toEqual(["Primera", "Segunda"]);
    expect(detail.payments.map((payment) => payment.method)).toEqual(["tarjeta", "efectivo"]);
    // El resumen de pago dedup+ordena de forma canónica y marca mixto.
    expect(detail.payment).toEqual({
      methods: ["efectivo", "tarjeta"],
      label: "Efectivo + Tarjeta",
      isMixed: true,
    });
  });

  it("degrada embebidos ausentes a null y soporta venta sin líneas ni cobros", () => {
    const detail = toSaleDetail(
      baseRawSale({
        professional: null,
        customer: null,
        session: null,
        lines: null,
        payments: null,
      }),
    );
    expect(detail.locationName).toBeNull();
    expect(detail.professionalName).toBeNull();
    expect(detail.customerName).toBeNull();
    expect(detail.lines).toEqual([]);
    expect(detail.payments).toEqual([]);
    expect(detail.grossTotalCents).toBe(0);
    expect(detail.vatBreakdown).toEqual([]);
  });
});

describe("buildSaleTicketData", () => {
  it("mapea el detalle a la foto imprimible del ticket (sin descuento)", () => {
    const detail = toSaleDetail(baseRawSale());
    const data = buildSaleTicketData(detail, { salonName: "Salón Nova" });

    expect(data.salonName).toBe("Salón Nova");
    expect(data.ticketRef).toBe("SALE-ABC"); // prefijo del id, en mayúsculas
    expect(data.currency).toBe("EUR");
    expect(data.issuedAt).toEqual(new Date("2026-07-22T18:30:00.000Z"));
    expect(data.coupon).toBeNull();
    expect(data.grossTotalCents).toBe(5000);
    expect(data.taxableBaseCents).toBe(4132);
    expect(data.totalCents).toBe(5000);
    expect(data.tenders).toEqual([{ label: "Tarjeta", amountCents: 5000 }]);
    // Reimpresión: no se re-acreditan puntos.
    expect(data.loyalty).toBeNull();
    // Base + IVA reconcilian con el total.
    const vatTotal = data.vatBreakdown.reduce((sum, row) => sum + row.taxCents, 0);
    expect(data.taxableBaseCents + vatTotal).toBe(data.totalCents);
  });

  it("representa el descuento de la venta como cupón (porcentaje derivado) y reconcilia el total", () => {
    // Bruto 5000, descuento 500 (10%), total cobrado 4500 (base 3719 + IVA 781).
    const detail = toSaleDetail(
      baseRawSale({
        discount_cents: 500,
        subtotal_cents: 3719,
        tax_cents: 781,
        total_cents: 4500,
      }),
    );
    const data = buildSaleTicketData(detail, { salonName: "Salón Nova" });

    expect(data.coupon).toEqual({ percentOff: 10, discountCents: 500 });
    expect(data.grossTotalCents).toBe(5000);
    expect(data.taxableBaseCents).toBe(3719);
    expect(data.totalCents).toBe(4500);
    const vatTotal = data.vatBreakdown.reduce((sum, row) => sum + row.taxCents, 0);
    expect(data.taxableBaseCents + vatTotal).toBe(data.totalCents);
  });
});
