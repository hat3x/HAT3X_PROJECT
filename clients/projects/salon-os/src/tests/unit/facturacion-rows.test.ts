/**
 * Helpers PUROS de las tablas de facturación (`@/lib/facturacion/rows`) — sub-5.
 *
 * Aísla la ÚNICA responsabilidad del módulo: NORMALIZAR y ETIQUETAR registros de
 * `pos_invoices` / `pos_sales` para pintarlos, sin tocar red ni BD. Se blindan los
 * puntos frágiles:
 *   · el jsonb `recipient_data` se lee de forma DEFENSIVA (ticket F2 → sin receptor);
 *   · el mapeo de tipo de factura a código AEAT (completa→F1, ticket→F2);
 *   · el resumen de método(s) de pago (dedupe + orden canónico + pago mixto);
 *   · la normalización de relaciones embebidas de PostgREST (objeto | array | null),
 *     incluida la sede por el camino venta → sesión → sede.
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_INVOICE_TOTALS,
  INVOICE_TYPE_CODE,
  INVOICE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  SALE_STATUS_LABEL,
  SALE_STATUS_VARIANT,
  embeddedOne,
  parseRecipientName,
  summarizePaymentMethods,
  toInvoiceRow,
  toInvoiceTotals,
  toSaleRow,
  type RawInvoice,
  type RawInvoiceTotals,
  type RawSale,
} from "@/lib/facturacion/rows";
import type { PosInvoiceType, PosPaymentMethod, PosSaleStatus } from "@/types/database";

describe("embeddedOne", () => {
  it("devuelve el objeto tal cual cuando la relación llega como objeto", () => {
    expect(embeddedOne({ full_name: "Ada" })).toEqual({ full_name: "Ada" });
  });

  it("toma el primer elemento cuando la relación llega como array", () => {
    expect(embeddedOne([{ name: "Centro" }, { name: "Otra" }])).toEqual({ name: "Centro" });
  });

  it("degrada a null con array vacío, null o undefined", () => {
    expect(embeddedOne([])).toBeNull();
    expect(embeddedOne(null)).toBeNull();
    expect(embeddedOne(undefined)).toBeNull();
  });
});

describe("parseRecipientName", () => {
  it("extrae el nombre (recortado) del receptor de una factura completa", () => {
    expect(parseRecipientName({ tax_id: "B12345678", name: "  Peluquería Nova SL " })).toBe(
      "Peluquería Nova SL",
    );
  });

  it("es null en factura simplificada (recipient_data null) y con formas inesperadas", () => {
    expect(parseRecipientName(null)).toBeNull();
    expect(parseRecipientName(undefined)).toBeNull();
    expect(parseRecipientName([])).toBeNull();
    expect(parseRecipientName("cadena")).toBeNull();
    expect(parseRecipientName({ tax_id: "B1" })).toBeNull(); // sin name
    expect(parseRecipientName({ name: "   " })).toBeNull(); // name en blanco
    expect(parseRecipientName({ name: 42 })).toBeNull(); // name no string
  });
});

describe("mapas de tipo de factura", () => {
  it("mapea completa→F1 y ticket→F2 (código AEAT)", () => {
    expect(INVOICE_TYPE_CODE.completa).toBe("F1");
    expect(INVOICE_TYPE_CODE.ticket).toBe("F2");
  });

  it("tiene etiqueta legible para cada tipo", () => {
    const types: PosInvoiceType[] = ["completa", "ticket"];
    for (const type of types) {
      expect(INVOICE_TYPE_LABEL[type]).toBeTruthy();
    }
  });
});

describe("summarizePaymentMethods", () => {
  it("sin cobros devuelve etiqueta vacía y no mixto", () => {
    expect(summarizePaymentMethods([])).toEqual({ methods: [], label: "", isMixed: false });
  });

  it("un solo método no es mixto y usa su etiqueta", () => {
    const result = summarizePaymentMethods([{ method: "efectivo" }]);
    expect(result.methods).toEqual(["efectivo"]);
    expect(result.label).toBe("Efectivo");
    expect(result.isMixed).toBe(false);
  });

  it("varios cobros del MISMO método base no cuentan como mixto", () => {
    const result = summarizePaymentMethods([{ method: "efectivo" }, { method: "efectivo" }]);
    expect(result.methods).toEqual(["efectivo"]);
    expect(result.label).toBe("Efectivo");
    expect(result.isMixed).toBe(false);
  });

  it("métodos DISTINTOS se deduplican, se ordenan de forma canónica y marcan mixto", () => {
    const result = summarizePaymentMethods([
      { method: "tarjeta" },
      { method: "efectivo" },
      { method: "tarjeta" },
    ]);
    // Orden canónico: efectivo antes que tarjeta (independiente del orden de llegada).
    expect(result.methods).toEqual(["efectivo", "tarjeta"]);
    expect(result.label).toBe("Efectivo + Tarjeta");
    expect(result.isMixed).toBe(true);
  });

  it("cubre todos los métodos del enum en la etiqueta", () => {
    const methods: PosPaymentMethod[] = [
      "efectivo",
      "tarjeta",
      "bizum",
      "transferencia",
      "otro",
    ];
    for (const method of methods) {
      expect(PAYMENT_METHOD_LABEL[method]).toBeTruthy();
    }
  });
});

describe("mapas de estado de venta", () => {
  it("tiene etiqueta y variante de Badge para cada estado", () => {
    const statuses: PosSaleStatus[] = ["open", "completed", "voided", "refunded"];
    for (const status of statuses) {
      expect(SALE_STATUS_LABEL[status]).toBeTruthy();
      expect(SALE_STATUS_VARIANT[status]).toBeTruthy();
    }
  });

  it("una venta anulada se resalta como destructive", () => {
    expect(SALE_STATUS_VARIANT.voided).toBe("destructive");
  });
});

describe("toInvoiceRow", () => {
  const base: RawInvoice = {
    id: "inv-1",
    full_number: "A-000123",
    invoice_type: "completa",
    issued_at: "2026-07-20T10:00:00.000Z",
    recipient_data: { tax_id: "B12345678", name: "Cliente SL", address: "Calle 1" },
    taxable_base_cents: 10_000,
    tax_cents: 2_100,
    total_cents: 12_100,
    currency: "EUR",
  };

  it("mapea columnas snapshot y resuelve el destinatario", () => {
    expect(toInvoiceRow(base)).toEqual({
      id: "inv-1",
      fullNumber: "A-000123",
      invoiceType: "completa",
      issuedAt: "2026-07-20T10:00:00.000Z",
      recipientName: "Cliente SL",
      taxableBaseCents: 10_000,
      taxCents: 2_100,
      totalCents: 12_100,
      currency: "EUR",
    });
  });

  it("en factura simplificada (F2) el destinatario es null", () => {
    const ticket: RawInvoice = {
      ...base,
      id: "inv-2",
      full_number: "T-000001",
      invoice_type: "ticket",
      recipient_data: null,
    };
    expect(toInvoiceRow(ticket).recipientName).toBeNull();
  });
});

describe("toInvoiceTotals", () => {
  it("mapea nº de facturas y sumas de la RPC al modelo de la vista", () => {
    const raw: RawInvoiceTotals = {
      invoice_count: 3,
      taxable_base_cents: 30_000,
      tax_cents: 6_300,
      total_cents: 36_300,
    };
    expect(toInvoiceTotals(raw)).toEqual({
      invoiceCount: 3,
      taxableBaseCents: 30_000,
      taxCents: 6_300,
      totalCents: 36_300,
    });
  });

  it("los totales vacíos son cero (periodo sin facturas)", () => {
    expect(EMPTY_INVOICE_TOTALS).toEqual({
      invoiceCount: 0,
      taxableBaseCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });
});

describe("toSaleRow", () => {
  it("normaliza embebidos como OBJETO (sede por venta→sesión→sede) y resume el pago", () => {
    const raw: RawSale = {
      id: "sale-1",
      sold_at: "2026-07-22T18:30:00.000Z",
      status: "completed",
      total_cents: 4_500,
      currency: "EUR",
      professional: { full_name: "Marta" },
      customer: { full_name: "Lucía" },
      session: { location: { name: "Centro" } },
      payments: [{ method: "tarjeta" }, { method: "efectivo" }],
    };
    expect(toSaleRow(raw)).toEqual({
      id: "sale-1",
      soldAt: "2026-07-22T18:30:00.000Z",
      locationName: "Centro",
      professionalName: "Marta",
      customerName: "Lucía",
      payment: {
        methods: ["efectivo", "tarjeta"],
        label: "Efectivo + Tarjeta",
        isMixed: true,
      },
      totalCents: 4_500,
      currency: "EUR",
      status: "completed",
    });
  });

  it("normaliza embebidos como ARRAY (forma alternativa de PostgREST)", () => {
    const raw: RawSale = {
      id: "sale-2",
      sold_at: "2026-07-22T09:00:00.000Z",
      status: "completed",
      total_cents: 2_000,
      currency: "EUR",
      professional: [{ full_name: "Marta" }],
      customer: [{ full_name: "Lucía" }],
      session: [{ location: [{ name: "Centro" }] }],
      payments: [{ method: "efectivo" }],
    };
    const row = toSaleRow(raw);
    expect(row.locationName).toBe("Centro");
    expect(row.professionalName).toBe("Marta");
    expect(row.customerName).toBe("Lucía");
  });

  it("venta sin sede/sesión, sin cliente y sin cobros degrada a null / sin etiqueta", () => {
    const raw: RawSale = {
      id: "sale-3",
      sold_at: "2026-07-21T12:00:00.000Z",
      status: "voided",
      total_cents: 0,
      currency: "EUR",
      professional: null,
      customer: null,
      session: null,
      payments: null,
    };
    const row = toSaleRow(raw);
    expect(row.locationName).toBeNull();
    expect(row.professionalName).toBeNull();
    expect(row.customerName).toBeNull();
    expect(row.payment).toEqual({ methods: [], label: "", isMixed: false });
    expect(row.status).toBe("voided");
  });

  it("sesión presente pero sin sede asignada → locationName null", () => {
    const raw: RawSale = {
      id: "sale-4",
      sold_at: "2026-07-21T12:00:00.000Z",
      status: "completed",
      total_cents: 1_000,
      currency: "EUR",
      professional: null,
      customer: null,
      session: { location: null },
      payments: [{ method: "bizum" }],
    };
    const row = toSaleRow(raw);
    expect(row.locationName).toBeNull();
    expect(row.payment.label).toBe("Bizum");
  });
});
