/**
 * Tests unitarios de la exportación del libro de facturas
 * (`@/lib/invoicing/export`).
 *
 * Cubre la serialización pura (sin BD ni Route Handler):
 *   · CSV: cabecera, BOM UTF-8, separador `;`, una fila por tipo de IVA,
 *     etiqueta de tipo (Simplificada/Completa), importes con coma y escapado;
 *   · JSON: documento estructurado con desglose anidado y metadatos de filtro;
 *   · helpers: `centsToAmount`, `parseTaxBreakdown`, `exportFilename`.
 */
import { describe, it, expect } from "vitest";

import {
  buildInvoicesCsv,
  buildInvoicesJson,
  centsToAmount,
  exportContentType,
  exportFilename,
  invoiceTypeLabel,
  parseTaxBreakdown,
  type ExportableInvoice,
  type ExportFilters,
} from "@/lib/invoicing";

const TICKET: ExportableInvoice = {
  full_number: "A-1",
  series: "A",
  sequential_number: 1,
  invoice_type: "ticket",
  issued_at: "2026-01-15T10:00:00.000Z",
  currency: "EUR",
  tax_breakdown: [{ vat_rate: 21, base_cents: 1000, cuota_cents: 210, total_cents: 1210 }],
  taxable_base_cents: 1000,
  tax_cents: 210,
  total_cents: 1210,
  issuer_data: { tax_id: "B12345678", legal_name: "Salón Demo SL", fiscal_address: "Calle Mayor 1" },
  recipient_data: null,
};

const COMPLETA_MULTI: ExportableInvoice = {
  full_number: "A-2",
  series: "A",
  sequential_number: 2,
  invoice_type: "completa",
  issued_at: "2026-02-20T12:30:00.000Z",
  currency: "EUR",
  tax_breakdown: [
    { vat_rate: 21, base_cents: 1000, cuota_cents: 210, total_cents: 1210 },
    { vat_rate: 10, base_cents: 500, cuota_cents: 50, total_cents: 550 },
  ],
  taxable_base_cents: 1500,
  tax_cents: 260,
  total_cents: 1760,
  issuer_data: { tax_id: "B12345678", legal_name: "Salón Demo SL", fiscal_address: "Calle Mayor 1" },
  recipient_data: { tax_id: "12345678Z", name: "Cliente; Demo", address: "Av. Siempre Viva 742" },
};

const ALL_FORMATS: ExportFilters = { series: null, from: null, to: null, format: "csv" };

function csvLines(csv: string): string[] {
  // Quita el BOM y parte por CRLF, descartando la línea final vacía.
  return csv.replace(/^﻿/, "").split("\r\n").filter((l) => l.length > 0);
}

/** Devuelve la línea `i` (falla si no existe) — satisface noUncheckedIndexedAccess. */
function lineAt(csv: string, i: number): string {
  const line = csvLines(csv)[i];
  if (line === undefined) throw new Error(`Falta la línea ${i} en el CSV`);
  return line;
}

describe("centsToAmount", () => {
  it("formatea con coma decimal y dos decimales", () => {
    expect(centsToAmount(1210)).toBe("12,10");
    expect(centsToAmount(5)).toBe("0,05");
    expect(centsToAmount(100)).toBe("1,00");
    expect(centsToAmount(0)).toBe("0,00");
  });

  it("preserva el signo negativo (abonos)", () => {
    expect(centsToAmount(-250)).toBe("-2,50");
  });
});

describe("invoiceTypeLabel", () => {
  it("ticket → Simplificada, completa → Completa", () => {
    expect(invoiceTypeLabel("ticket")).toBe("Simplificada");
    expect(invoiceTypeLabel("completa")).toBe("Completa");
  });
});

describe("parseTaxBreakdown", () => {
  it("normaliza filas válidas y descarta lo que no es un objeto", () => {
    const rows = parseTaxBreakdown([
      { vat_rate: 21, base_cents: 1000, cuota_cents: 210, total_cents: 1210 },
      null,
      "basura",
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ vat_rate: 21, base_cents: 1000, cuota_cents: 210, total_cents: 1210 });
  });

  it("devuelve vacío ante un valor no-array", () => {
    expect(parseTaxBreakdown(null)).toEqual([]);
    expect(parseTaxBreakdown({})).toEqual([]);
  });
});

describe("buildInvoicesCsv", () => {
  it("empieza por BOM UTF-8 y la fila de cabecera", () => {
    const csv = buildInvoicesCsv([TICKET]);
    expect(csv.startsWith("﻿")).toBe(true);
    const header = lineAt(csv, 0);
    expect(header.split(";")[0]).toBe("Numero");
    expect(header).toContain("Tipo");
    expect(header).toContain("Total factura");
  });

  it("emite una fila por línea de desglose de IVA", () => {
    const csv = buildInvoicesCsv([COMPLETA_MULTI]);
    const lines = csvLines(csv);
    // 1 cabecera + 2 tipos de IVA
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(";21;");
    expect(lines[2]).toContain(";10;");
  });

  it("mapea el tipo, la fecha (solo YYYY-MM-DD) e importes con coma", () => {
    const csv = buildInvoicesCsv([TICKET]);
    const row = lineAt(csv, 1).split(";");
    expect(row[0]).toBe("A-1");
    expect(row[3]).toBe("Simplificada");
    expect(row[4]).toBe("2026-01-15");
    expect(row[10]).toBe("10,00"); // base
    expect(row[11]).toBe("2,10"); // cuota
    expect(row[15]).toBe("12,10"); // total factura
  });

  it("deja vacíos los datos del receptor en un ticket", () => {
    const row = lineAt(buildInvoicesCsv([TICKET]), 1).split(";");
    expect(row[7]).toBe(""); // NIF receptor
    expect(row[8]).toBe(""); // Nombre receptor
  });

  it("escapa campos con el separador entrecomillándolos", () => {
    const csv = buildInvoicesCsv([COMPLETA_MULTI]);
    // El nombre "Cliente; Demo" contiene `;` → debe ir entrecomillado.
    expect(csv).toContain('"Cliente; Demo"');
  });

  it("no pierde una factura sin desglose (fila a cero)", () => {
    const degenerate: ExportableInvoice = { ...TICKET, tax_breakdown: [] };
    const lines = csvLines(buildInvoicesCsv([degenerate]));
    expect(lines).toHaveLength(2); // cabecera + 1 fila
    expect(lines[1]).toContain(";0;"); // tipo IVA 0
  });
});

describe("buildInvoicesJson", () => {
  it("produce un documento estructurado con filtros, conteo y desglose anidado", () => {
    const filters: ExportFilters = { series: "A", from: "2026-01-01", to: "2026-12-31", format: "json" };
    const doc = JSON.parse(buildInvoicesJson([TICKET, COMPLETA_MULTI], filters, "2026-07-14T00:00:00.000Z"));

    expect(doc.count).toBe(2);
    expect(doc.filters).toEqual(filters);
    expect(doc.generatedAt).toBe("2026-07-14T00:00:00.000Z");
    expect(doc.invoices[0].invoiceType).toBe("ticket");
    expect(doc.invoices[1].invoiceType).toBe("completa");
    expect(doc.invoices[1].taxBreakdown).toHaveLength(2);
    expect(doc.invoices[1].recipient.taxId).toBe("12345678Z");
    expect(doc.invoices[0].recipient).toBeNull();
  });
});

describe("exportFilename / exportContentType", () => {
  it("compone el nombre con serie y periodo cuando se filtran", () => {
    expect(exportFilename({ series: "A", from: "2026-01-01", to: "2026-03-31", format: "csv" })).toBe(
      "facturas_serie-A_2026-01-01_2026-03-31.csv",
    );
    expect(exportFilename(ALL_FORMATS)).toBe("facturas.csv");
  });

  it("devuelve el content-type con charset por formato", () => {
    expect(exportContentType("csv")).toBe("text/csv; charset=utf-8");
    expect(exportContentType("json")).toBe("application/json; charset=utf-8");
  });
});
