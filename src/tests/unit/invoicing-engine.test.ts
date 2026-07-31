/**
 * Tests unitarios del motor puro de construcción del registro (`@/lib/invoicing`).
 *
 * Cubre:
 *   · desglose de IVA (21% y multi-tipo) → tax_breakdown {vat_rate, base, cuota, total};
 *   · TICKET (simplificada) sin receptor vs FACTURA COMPLETA con datos del cliente;
 *   · reglas de dominio: emisor obligatorio, receptor obligatorio en completa,
 *     nº secuencial y total válidos.
 */
import { describe, it, expect } from "vitest";

import { computeSaleTotals, type SaleLineInput } from "@/lib/payments";
import {
  buildInvoiceRecord,
  InvoiceEmissionError,
  toTaxBreakdownRows,
  type BuildInvoiceRecordInput,
  type IssuerData,
  type RecipientData,
} from "@/lib/invoicing";

const ISSUER: IssuerData = {
  taxId: "B12345678",
  legalName: "Salón Demo SL",
  fiscalAddress: "Calle Mayor 1, Madrid",
};

const RECIPIENT: RecipientData = {
  taxId: "12345678Z",
  name: "Cliente Demo",
  address: "Av. Siempre Viva 742",
};

// Una línea a 21%: PVP 12,10 € (bruto) → base 10,00 € / cuota 2,10 €.
const LINE_21: SaleLineInput = { quantity: 1, unitPriceCents: 1210, vatRate: 21 };

function baseInput(overrides: Partial<BuildInvoiceRecordInput> = {}): BuildInvoiceRecordInput {
  return {
    salonId: "salon-1",
    saleId: null,
    invoiceType: "ticket",
    series: "A",
    sequentialNumber: 1,
    issuedAt: new Date("2026-07-14T08:30:00.000Z"),
    totals: computeSaleTotals([LINE_21]),
    issuer: ISSUER,
    recipient: null,
    ...overrides,
  };
}

describe("toTaxBreakdownRows — desglose de IVA a jsonb", () => {
  it("extrae base/cuota/total del bruto al 21%", () => {
    const rows = toTaxBreakdownRows(computeSaleTotals([LINE_21]));
    expect(rows).toEqual([
      { vat_rate: 21, base_cents: 1000, cuota_cents: 210, total_cents: 1210 },
    ]);
  });

  it("soporta varios tipos impositivos en un mismo documento", () => {
    const rows = toTaxBreakdownRows(
      computeSaleTotals([
        LINE_21,
        { quantity: 1, unitPriceCents: 1100, vatRate: 10 }, // base 1000 / cuota 100
      ]),
    );
    // Ordenado de mayor a menor tipo (21 antes que 10).
    expect(rows.map((r) => r.vat_rate)).toEqual([21, 10]);
    expect(rows[1]).toEqual({
      vat_rate: 10,
      base_cents: 1000,
      cuota_cents: 100,
      total_cents: 1100,
    });
  });
});

describe("buildInvoiceRecord — TICKET vs COMPLETA", () => {
  it("ticket: sin receptor y agregados coherentes (base + cuota = total)", () => {
    const { insert, fullNumber } = buildInvoiceRecord(baseInput());
    expect(insert.invoice_type).toBe("ticket");
    expect(insert.recipient_data).toBeNull();
    expect(insert.series).toBe("A");
    expect(insert.sequential_number).toBe(1);
    expect(fullNumber).toBe("A-1");
    expect(insert.taxable_base_cents).toBe(1000);
    expect(insert.tax_cents).toBe(210);
    expect(insert.total_cents).toBe(1210);
    expect(insert.total_cents).toBe(insert.taxable_base_cents + insert.tax_cents);
  });

  it("completa: persiste el snapshot del receptor con NIF y nombre", () => {
    const { insert } = buildInvoiceRecord(
      baseInput({ invoiceType: "completa", recipient: RECIPIENT }),
    );
    expect(insert.invoice_type).toBe("completa");
    expect(insert.recipient_data).toEqual({
      tax_id: "12345678Z",
      name: "Cliente Demo",
      address: "Av. Siempre Viva 742",
    });
    expect(insert.issuer_data).toEqual({
      tax_id: "B12345678",
      legal_name: "Salón Demo SL",
      fiscal_address: "Calle Mayor 1, Madrid",
    });
  });
});

describe("buildInvoiceRecord — reglas de dominio", () => {
  it("rechaza emisor sin NIF o sin razón social", () => {
    expect(() =>
      buildInvoiceRecord(baseInput({ issuer: { ...ISSUER, taxId: "" } })),
    ).toThrow(InvoiceEmissionError);
    expect(() =>
      buildInvoiceRecord(baseInput({ issuer: { ...ISSUER, legalName: "  " } })),
    ).toThrow(InvoiceEmissionError);
  });

  it("rechaza factura completa sin receptor identificado", () => {
    expect(() =>
      buildInvoiceRecord(baseInput({ invoiceType: "completa", recipient: null })),
    ).toThrow(InvoiceEmissionError);
    expect(() =>
      buildInvoiceRecord(
        baseInput({
          invoiceType: "completa",
          recipient: { taxId: "", name: "Sin NIF", address: null },
        }),
      ),
    ).toThrow(InvoiceEmissionError);
  });

  it("rechaza número secuencial no positivo y total no positivo", () => {
    expect(() => buildInvoiceRecord(baseInput({ sequentialNumber: 0 }))).toThrow(
      InvoiceEmissionError,
    );
    expect(() =>
      buildInvoiceRecord(baseInput({ totals: computeSaleTotals([]) })),
    ).toThrow(InvoiceEmissionError);
  });
});
