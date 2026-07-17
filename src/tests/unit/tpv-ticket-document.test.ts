/**
 * Tests del ticket de compra imprimible (impresora térmica).
 *
 * Cubre las dos partes puras del flujo de impresión:
 *   · `buildTicketDocumentHtml` (`@/lib/tpv/ticket-document`) — el documento HTML
 *     autónomo: que incluye lo que exige la subtarea (líneas, descuento del cupón,
 *     totales/IVA y —si hubo cliente— puntos ganados y saldo), que dimensiona el
 *     `@page`/`@media print` al rollo elegido (58/80 mm) y que escapa el contenido.
 *   · `buildTicketData` (`@/app/(dashboard)/tpv/print-ticket`) — el mapeo del estado
 *     del carrito a los datos imprimibles (líneas en céntimos, cupón, IVA, cobros).
 *
 * El disparo real de impresión (`printTicketDocument`, iframe + `window.print()`)
 * no se testea aquí: es un envoltorio de DOM sin lógica de negocio.
 */
import { describe, it, expect } from "vitest";

import {
  computeTicketTotals,
  type TicketLine,
} from "@/app/(dashboard)/tpv/cart";
import { buildTicketData } from "@/app/(dashboard)/tpv/print-ticket";
import {
  buildTicketDocumentHtml,
  type TicketDocumentData,
} from "@/lib/tpv/ticket-document";

const BASE: TicketDocumentData = {
  salonName: "Salón Bella",
  ticketRef: "A1B2C3D4",
  issuedAt: new Date("2026-07-17T07:30:00.000Z"),
  currency: "EUR",
  lines: [
    {
      description: "Corte de pelo",
      quantity: 1,
      unitPriceCents: 1210,
      vatRate: 21,
      lineTotalCents: 1210,
    },
    {
      description: "Champú premium",
      quantity: 2,
      unitPriceCents: 550,
      vatRate: 21,
      lineTotalCents: 1100,
    },
  ],
  grossTotalCents: 2310,
  coupon: null,
  taxableBaseCents: 1909,
  vatBreakdown: [{ vatRate: 21, baseCents: 1909, taxCents: 401 }],
  totalCents: 2310,
  tenders: [{ label: "Efectivo", amountCents: 2310 }],
  loyalty: null,
  notes: null,
};

describe("buildTicketDocumentHtml — estructura y contenido", () => {
  const html = buildTicketDocumentHtml(BASE);

  it("es un documento HTML autónomo", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("muestra la cabecera del salón y la naturaleza del documento", () => {
    expect(html).toContain("Salón Bella");
    expect(html).toContain("Ticket de compra");
    expect(html).toContain("A1B2C3D4");
  });

  it("lista las líneas con su importe", () => {
    expect(html).toContain("Corte de pelo");
    expect(html).toContain("Champú premium");
    expect(html).toContain("12,10"); // importe de la primera línea
  });

  it("muestra base imponible, desglose de IVA por tipo y total", () => {
    expect(html).toContain("Base imponible");
    expect(html).toContain("IVA 21%");
    expect(html).toContain("TOTAL");
  });

  it("lista los medios de pago", () => {
    expect(html).toContain("Efectivo");
  });

  it("avisa de que el ticket no es una factura", () => {
    expect(html).toContain("Este documento no es una factura.");
  });

  it("incluye el botón de impresión por defecto y lo puede ocultar", () => {
    expect(buildTicketDocumentHtml(BASE)).toContain("window.print()");
    expect(
      buildTicketDocumentHtml(BASE, { showPrintButton: false }),
    ).not.toContain('class="print-btn"');
  });
});

describe("buildTicketDocumentHtml — cupón, fidelización y notas", () => {
  it("muestra el subtotal y el descuento cuando hubo cupón", () => {
    const html = buildTicketDocumentHtml({
      ...BASE,
      coupon: { percentOff: 20, discountCents: 462 },
    });
    expect(html).toContain("Subtotal");
    expect(html).toContain("Cupón");
    expect(html).toContain("20%");
  });

  it("no muestra bloque de cupón cuando no lo hubo", () => {
    expect(buildTicketDocumentHtml(BASE)).not.toContain("Cupón");
  });

  it("muestra puntos ganados, saldo, cliente y recompensa si hubo cliente", () => {
    const html = buildTicketDocumentHtml({
      ...BASE,
      loyalty: {
        customerName: "Ana García",
        pointsEarned: 3,
        pointsBalance: 12,
        reward: { label: "Servicio gratis", code: "REW-XYZ" },
      },
    });
    expect(html).toContain("Fidelización");
    expect(html).toContain("Ana García");
    expect(html).toContain("+3");
    expect(html).toContain("Saldo");
    expect(html).toContain("12 puntos");
    expect(html).toContain("¡Recompensa desbloqueada!");
    expect(html).toContain("Servicio gratis");
    expect(html).toContain("REW-XYZ");
  });

  it("omite el bloque de fidelización si no hubo cliente", () => {
    expect(buildTicketDocumentHtml(BASE)).not.toContain("Fidelización");
  });

  it("usa el singular 'punto' cuando el saldo es 1", () => {
    const html = buildTicketDocumentHtml({
      ...BASE,
      loyalty: { customerName: null, pointsEarned: 1, pointsBalance: 1, reward: null },
    });
    expect(html).toContain("1 punto");
    expect(html).not.toContain("1 puntos");
  });

  it("incluye la nota del ticket cuando la hay", () => {
    const html = buildTicketDocumentHtml({ ...BASE, notes: "Volver en 3 semanas" });
    expect(html).toContain("Volver en 3 semanas");
  });
});

describe("buildTicketDocumentHtml — ancho de rollo y seguridad", () => {
  it("dimensiona el @page a 80 mm por defecto", () => {
    expect(buildTicketDocumentHtml(BASE)).toContain("size: 80mm auto");
  });

  it("dimensiona el @page a 58 mm cuando se pide", () => {
    expect(buildTicketDocumentHtml(BASE, { rollWidthMm: 58 })).toContain(
      "size: 58mm auto",
    );
  });

  it("aplica reglas @media print para el rollo térmico", () => {
    expect(buildTicketDocumentHtml(BASE)).toContain("@media print");
  });

  it("escapa el contenido dinámico para evitar inyección de HTML", () => {
    const html = buildTicketDocumentHtml({
      ...BASE,
      salonName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

// -----------------------------------------------------------------------------
// buildTicketData — mapeo del estado del carrito a datos imprimibles
// -----------------------------------------------------------------------------

function line(overrides: Partial<TicketLine>): TicketLine {
  return {
    localId: "l1",
    kind: "manual",
    refId: null,
    description: "Concepto",
    quantity: "1",
    unitPrice: "10,00",
    vatRate: "21",
    ...overrides,
  };
}

describe("buildTicketData — mapeo del carrito", () => {
  const lines: TicketLine[] = [
    line({ localId: "a", description: "Corte de pelo", unitPrice: "12,10" }),
    line({ localId: "b", description: "Champú", quantity: "2", unitPrice: "5,50" }),
  ];

  it("mapea las líneas a céntimos con su importe bruto (cantidad × unitario)", () => {
    const data = buildTicketData({
      salonName: "Salón Bella",
      ticketRef: "A1B2C3D4",
      issuedAt: new Date("2026-07-17T07:30:00.000Z"),
      lines,
      totals: computeTicketTotals(lines),
      tenders: [{ label: "Efectivo", amountCents: 2310 }],
      loyalty: null,
      notes: null,
    });

    expect(data.currency).toBe("EUR");
    expect(data.lines).toHaveLength(2);
    expect(data.lines[0]).toMatchObject({
      description: "Corte de pelo",
      quantity: 1,
      unitPriceCents: 1210,
      lineTotalCents: 1210,
    });
    expect(data.lines[1]).toMatchObject({
      quantity: 2,
      unitPriceCents: 550,
      lineTotalCents: 1100,
    });
    expect(data.coupon).toBeNull();
    expect(data.tenders).toEqual([{ label: "Efectivo", amountCents: 2310 }]);
  });

  it("refleja el cupón cuando el descuento es > 0", () => {
    const totals = computeTicketTotals(lines, 20);
    const data = buildTicketData({
      salonName: "Salón Bella",
      ticketRef: "A1B2C3D4",
      issuedAt: new Date("2026-07-17T07:30:00.000Z"),
      lines,
      totals,
      tenders: [],
      loyalty: null,
      notes: null,
    });

    expect(data.coupon).not.toBeNull();
    expect(data.coupon?.percentOff).toBe(20);
    expect(data.coupon?.discountCents).toBe(totals.couponDiscountCents);
    // El bruto (subtotal) es la suma de las líneas antes del cupón.
    expect(data.grossTotalCents).toBe(2310);
    // Base imponible y total salen POST-descuento (de los totales calculados).
    expect(data.taxableBaseCents).toBe(totals.subtotalCents);
    expect(data.totalCents).toBe(totals.totalCents);
  });

  it("traslada la fidelización y la nota tal cual", () => {
    const loyalty = {
      customerName: "Ana García",
      pointsEarned: 3,
      pointsBalance: 12,
      reward: null,
    };
    const data = buildTicketData({
      salonName: "Salón Bella",
      ticketRef: "A1B2C3D4",
      issuedAt: new Date("2026-07-17T07:30:00.000Z"),
      lines,
      totals: computeTicketTotals(lines),
      tenders: [],
      loyalty,
      notes: "Volver pronto",
    });

    expect(data.loyalty).toEqual(loyalty);
    expect(data.notes).toBe("Volver pronto");
    expect(data.vatBreakdown[0]).toMatchObject({ vatRate: 21 });
  });
});
