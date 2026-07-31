/**
 * Tests del documento imprimible de factura (`@/lib/invoicing/document`).
 *
 * Verifica el HTML autónomo: cabecera con tipo/serie/número/fecha, emisor y
 * receptor (solo en completa), desglose de IVA por tipo y totales, detalle de
 * líneas, y el escape del contenido dinámico (no inyección de HTML).
 */
import { describe, it, expect } from "vitest";

import { buildInvoiceDocumentHtml, type InvoiceDocumentData } from "@/lib/invoicing";

const COMPLETA: InvoiceDocumentData = {
  invoiceType: "completa",
  series: "A",
  sequentialNumber: 7,
  fullNumber: "A-7",
  issuedAt: new Date("2026-07-14T08:30:00.000Z"),
  currency: "EUR",
  issuer: {
    taxId: "B12345678",
    legalName: "Salón Bella S.L.",
    fiscalAddress: "Calle Mayor 1, Madrid",
  },
  recipient: {
    taxId: "12345678Z",
    name: "Ana García",
    address: "Av. del Sol 3, Madrid",
  },
  taxBreakdown: [
    { vat_rate: 21, base_cents: 1000, cuota_cents: 210, total_cents: 1210 },
    { vat_rate: 10, base_cents: 500, cuota_cents: 50, total_cents: 550 },
  ],
  taxableBaseCents: 1500,
  taxCents: 260,
  totalCents: 1760,
};

describe("buildInvoiceDocumentHtml — estructura común", () => {
  const html = buildInvoiceDocumentHtml(COMPLETA);

  it("es un documento HTML autónomo", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("muestra el número, la serie y el emisor", () => {
    expect(html).toContain("A-7");
    expect(html).toContain("B12345678");
    expect(html).toContain("Salón Bella S.L.");
  });

  it("muestra el desglose de IVA por tipo y los totales", () => {
    expect(html).toContain("Desglose de IVA");
    expect(html).toContain("21%");
    expect(html).toContain("10%");
    expect(html).toContain("Base imponible");
    expect(html).toContain("Total IVA");
  });

  it("muestra la fecha de expedición en la zona horaria indicada", () => {
    expect(html).toContain("14/07/2026");
  });
});

describe("buildInvoiceDocumentHtml — tipo de factura", () => {
  it("la factura completa muestra los datos del receptor", () => {
    const html = buildInvoiceDocumentHtml(COMPLETA);
    expect(html).toContain("Ana García");
    expect(html).toContain("12345678Z");
  });

  it("el ticket es simplificado y no lleva receptor", () => {
    const ticket: InvoiceDocumentData = {
      ...COMPLETA,
      invoiceType: "ticket",
      recipient: null,
    };
    const html = buildInvoiceDocumentHtml(ticket);
    expect(html).toContain("Factura simplificada");
    expect(html).toContain("sin datos del destinatario");
  });
});

describe("buildInvoiceDocumentHtml — detalle de líneas", () => {
  it("renderiza las líneas cuando se aportan", () => {
    const html = buildInvoiceDocumentHtml({
      ...COMPLETA,
      lines: [
        {
          description: "Corte de pelo",
          quantity: 1,
          unitPriceCents: 1210,
          vatRate: 21,
          lineTotalCents: 1210,
        },
      ],
    });
    expect(html).toContain("Detalle de líneas");
    expect(html).toContain("Corte de pelo");
  });
});

describe("buildInvoiceDocumentHtml — seguridad", () => {
  it("escapa el contenido dinámico para evitar inyección de HTML", () => {
    const html = buildInvoiceDocumentHtml({
      ...COMPLETA,
      issuer: { ...COMPLETA.issuer, legalName: "<script>alert(1)</script>" },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
