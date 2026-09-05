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

// ---------------------------------------------------------------------------
// Operación exenta de IVA
//
// El Reglamento de Facturación (RD 1619/2012, art. 6.1.j) exige que una factura
// sin IVA HAGA CONSTAR el motivo de la exención. Una factura con la cuota a
// cero y sin la mención está formalmente incompleta, y eso se le reprocha a la
// clínica, no a nosotros.
//
// La exención se DEDUCE del documento —cuota cero y todo el desglose al 0 %—
// para no depender de una marca aparte que se pueda quedar sin poner.
// ---------------------------------------------------------------------------

describe("buildInvoiceDocumentHtml — exención de IVA", () => {
  const EXENTA: InvoiceDocumentData = {
    ...COMPLETA,
    taxBreakdown: [{ vat_rate: 0, base_cents: 29000, cuota_cents: 0, total_cents: 29000 }],
    taxableBaseCents: 29000,
    taxCents: 0,
    totalCents: 29000,
  };

  it("hace constar el motivo de la exención", () => {
    const html = buildInvoiceDocumentHtml(EXENTA);

    expect(html).toContain("exenta");
    expect(html).toContain("20.Uno.3");
  });

  it("cita la ley del IVA, no solo el artículo", () => {
    const html = buildInvoiceDocumentHtml(EXENTA);

    expect(html).toMatch(/37\/1992/);
  });

  it("una factura con IVA NO lleva la mención", () => {
    const html = buildInvoiceDocumentHtml(COMPLETA);

    expect(html).not.toContain("exenta");
  });

  it("una factura a cero euros no se declara exenta: no hay operación", () => {
    const cero: InvoiceDocumentData = {
      ...COMPLETA,
      taxBreakdown: [],
      taxableBaseCents: 0,
      taxCents: 0,
      totalCents: 0,
    };

    expect(buildInvoiceDocumentHtml(cero)).not.toContain("exenta");
  });

  it("si hay una linea con IVA, no es exenta aunque la cuota total sea baja", () => {
    const mixta: InvoiceDocumentData = {
      ...COMPLETA,
      taxBreakdown: [
        { vat_rate: 0, base_cents: 29000, cuota_cents: 0, total_cents: 29000 },
        { vat_rate: 21, base_cents: 1000, cuota_cents: 210, total_cents: 1210 },
      ],
      taxableBaseCents: 30000,
      taxCents: 210,
      totalCents: 30210,
    };

    expect(buildInvoiceDocumentHtml(mixta)).not.toContain("exenta");
  });
});
