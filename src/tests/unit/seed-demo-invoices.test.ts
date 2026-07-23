/**
 * Tests unitarios del planificador PURO de FACTURAS demo (`scripts/seed-demo-invoices`).
 *
 * El planificador alimenta el paso `seedInvoices` de `scripts/seed-demo-salon.ts` (sub-8):
 * decide QUÉ ventas se facturan y de qué tipo (F2/ticket mayoría + algunas F1/completa),
 * mientras que la numeración correlativa y la HUELLA encadenada las resuelve
 * `@/lib/invoicing` (`emitInvoice`, NO se reimplementan aquí). Su contrato con la petición
 * del cliente se blinda SIN base de datos:
 *   · SUBCONJUNTO — se factura una parte de las ventas (~100–300), no todas.
 *   · MEZCLA F2/F1 — mayoría tickets simplificados; una minoría facturas completas con
 *     DESTINATARIO ficticio (NIF de forma válida vía `syntheticNif`).
 *   · ORDEN ASCENDENTE — el plan sale ordenado por `issuedAtIso` (base de `issued_at`
 *     ascendente dentro de la serie, requisito de la cadena de facturación).
 *   · DETERMINISMO — misma entrada ⇒ mismo plan (idempotencia: las facturas son
 *     inmutables y el dedup por `sale_id` reconoce las ya emitidas).
 */
import { describe, it, expect } from "vitest";

import {
  DEFAULT_DEMO_INVOICE_COUNT,
  DEFAULT_F1_RATE,
  MAX_DEMO_INVOICE_COUNT,
  MIN_DEMO_INVOICE_COUNT,
  resolveInvoiceCount,
  selectInvoicePlan,
  syntheticNif,
  type DemoInvoiceSaleInput,
} from "../../../scripts/seed-demo-invoices";

/** Letras de control del DNI (para reverificar `syntheticNif` de forma independiente). */
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/**
 * Construye un lote determinista de ventas facturables variadas: fechas ascendentes,
 * importes > 0, y una fracción SIN nombre de cliente (solo pueden ser F2). El día se
 * mueve para que `soldAtIso` sea único y creciente por índice.
 */
function buildSales(
  count: number,
  opts: { withoutNameEvery?: number; zeroTotalEvery?: number } = {},
): DemoInvoiceSaleInput[] {
  const { withoutNameEvery, zeroTotalEvery } = opts;
  const sales: DemoInvoiceSaleInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const day = String(1 + (i % 28)).padStart(2, "0");
    const month = String(1 + (Math.floor(i / 28) % 12)).padStart(2, "0");
    const hasName = withoutNameEvery === undefined || i % withoutNameEvery !== 0;
    const zeroTotal = zeroTotalEvery !== undefined && i % zeroTotalEvery === 0;
    sales.push({
      saleId: `sale-${String(i).padStart(4, "0")}`,
      soldAtIso: `2026-${month}-${day}T${String(9 + (i % 10)).padStart(2, "0")}:30:00.000Z`,
      customerId: `cust-${String(i % 40).padStart(3, "0")}`,
      customerName: hasName ? `Cliente ${i % 40}` : null,
      customerAddress: i % 3 === 0 ? `Calle ${i % 40}, Madrid` : null,
      totalCents: zeroTotal ? 0 : 1000 + (i % 50) * 137,
    });
  }
  return sales;
}

describe("resolveInvoiceCount — saturación al rango pedido 100–300", () => {
  it("usa el valor por defecto cuando no hay variable", () => {
    expect(resolveInvoiceCount(undefined)).toBe(DEFAULT_DEMO_INVOICE_COUNT);
    expect(DEFAULT_DEMO_INVOICE_COUNT).toBeGreaterThanOrEqual(MIN_DEMO_INVOICE_COUNT);
    expect(DEFAULT_DEMO_INVOICE_COUNT).toBeLessThanOrEqual(MAX_DEMO_INVOICE_COUNT);
  });

  it("respeta un valor dentro del rango", () => {
    expect(resolveInvoiceCount("150")).toBe(150);
    expect(resolveInvoiceCount("  250 ")).toBe(250);
  });

  it("satura por debajo del mínimo y por encima del máximo", () => {
    expect(resolveInvoiceCount("10")).toBe(MIN_DEMO_INVOICE_COUNT);
    expect(resolveInvoiceCount("5000")).toBe(MAX_DEMO_INVOICE_COUNT);
  });

  it("cae al valor por defecto ante entradas no numéricas", () => {
    expect(resolveInvoiceCount("abc")).toBe(DEFAULT_DEMO_INVOICE_COUNT);
    expect(resolveInvoiceCount("")).toBe(DEFAULT_DEMO_INVOICE_COUNT);
  });
});

describe("syntheticNif — DNI ficticio de forma válida", () => {
  it("tiene 8 dígitos + letra de control correcta", () => {
    for (const seed of ["cust-000", "cust-017", "sale-1234", "María García"]) {
      const nif = syntheticNif(seed);
      expect(nif).toMatch(/^\d{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/);
      const number = Number.parseInt(nif.slice(0, 8), 10);
      const expectedLetter = DNI_LETTERS.charAt(number % 23);
      expect(nif.charAt(8)).toBe(expectedLetter);
    }
  });

  it("es determinista (misma semilla ⇒ mismo NIF)", () => {
    expect(syntheticNif("cust-042")).toBe(syntheticNif("cust-042"));
    expect(syntheticNif("cust-042")).not.toBe(syntheticNif("cust-043"));
  });
});

describe("selectInvoicePlan — subconjunto, orden y mezcla", () => {
  it("selecciona exactamente min(objetivo, ventas) facturas, con saleIds únicos y válidos", () => {
    const sales = buildSales(500);
    const plan = selectInvoicePlan({ sales, targetCount: 200 });
    expect(plan).toHaveLength(200);
    const validIds = new Set(sales.map((s) => s.saleId));
    const seen = new Set<string>();
    for (const item of plan) {
      expect(validIds.has(item.saleId)).toBe(true);
      expect(seen.has(item.saleId)).toBe(false); // sin duplicados
      seen.add(item.saleId);
    }
  });

  it("cuando el objetivo supera las ventas, factura todas las facturables", () => {
    const sales = buildSales(120);
    const plan = selectInvoicePlan({ sales, targetCount: 300 });
    expect(plan).toHaveLength(120);
  });

  it("excluye las ventas con total <= 0", () => {
    const sales = buildSales(150, { zeroTotalEvery: 5 }); // 1 de cada 5 con total 0
    const facturables = sales.filter((s) => s.totalCents > 0).length;
    const plan = selectInvoicePlan({ sales, targetCount: MAX_DEMO_INVOICE_COUNT });
    expect(plan).toHaveLength(facturables);
    const zeroIds = new Set(sales.filter((s) => s.totalCents <= 0).map((s) => s.saleId));
    for (const item of plan) expect(zeroIds.has(item.saleId)).toBe(false);
  });

  it("el plan sale ordenado por issuedAtIso ascendente (issued_at asc en la serie)", () => {
    const sales = buildSales(300);
    const plan = selectInvoicePlan({ sales, targetCount: 200 });
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i - 1]!.issuedAtIso <= plan[i]!.issuedAtIso).toBe(true);
    }
  });

  it("issuedAtIso coincide con el soldAtIso de su venta (fecha retrodatada)", () => {
    const sales = buildSales(200);
    const soldById = new Map(sales.map((s) => [s.saleId, s.soldAtIso]));
    const plan = selectInvoicePlan({ sales, targetCount: 120 });
    for (const item of plan) {
      expect(item.issuedAtIso).toBe(soldById.get(item.saleId));
    }
  });

  it("es determinista: misma entrada ⇒ plan idéntico (deep equal)", () => {
    const sales = buildSales(250);
    const first = selectInvoicePlan({ sales, targetCount: 180 });
    const second = selectInvoicePlan({ sales, targetCount: 180 });
    expect(second).toEqual(first);
  });

  it("una lista vacía de ventas produce un plan vacío", () => {
    expect(selectInvoicePlan({ sales: [], targetCount: 200 })).toHaveLength(0);
  });
});

describe("selectInvoicePlan — tipos F2 (mayoría) y F1 (con destinatario)", () => {
  it("con f1Rate 0 todas son ticket (F2) y sin receptor", () => {
    const sales = buildSales(200);
    const plan = selectInvoicePlan({ sales, targetCount: 150, f1Rate: 0 });
    for (const item of plan) {
      expect(item.invoiceType).toBe("ticket");
      expect(item.recipient).toBeNull();
    }
  });

  it("con f1Rate 1 todas las ventas CON nombre son completa (F1) con receptor válido", () => {
    const sales = buildSales(120);
    const plan = selectInvoicePlan({ sales, targetCount: 120, f1Rate: 1 });
    const nameById = new Map(sales.map((s) => [s.saleId, s.customerName]));
    for (const item of plan) {
      expect(item.invoiceType).toBe("completa");
      expect(item.recipient).not.toBeNull();
      expect(item.recipient!.taxId).toMatch(/^\d{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/);
      expect(item.recipient!.name).toBe(nameById.get(item.saleId));
    }
  });

  it("una venta SIN nombre de cliente nunca es F1, aunque f1Rate sea 1", () => {
    const sales = buildSales(100, { withoutNameEvery: 3 }); // 1 de cada 3 sin nombre
    const plan = selectInvoicePlan({ sales, targetCount: MAX_DEMO_INVOICE_COUNT, f1Rate: 1 });
    const nameById = new Map(sales.map((s) => [s.saleId, s.customerName]));
    for (const item of plan) {
      if (nameById.get(item.saleId) === null) {
        expect(item.invoiceType).toBe("ticket");
        expect(item.recipient).toBeNull();
      }
    }
  });

  it("con la tasa por defecto la MAYORÍA son F2 y hay ALGUNAS F1 (mezcla)", () => {
    const sales = buildSales(400);
    const plan = selectInvoicePlan({ sales, targetCount: 200 });
    const completa = plan.filter((i) => i.invoiceType === "completa").length;
    const ticket = plan.filter((i) => i.invoiceType === "ticket").length;
    expect(completa).toBeGreaterThan(0); // "algunas F1"
    expect(ticket).toBeGreaterThan(completa); // "mayoría F2"
    // Debe rondar la tasa por defecto (margen amplio para el ruido del hash).
    const ratio = completa / plan.length;
    expect(ratio).toBeGreaterThan(DEFAULT_F1_RATE - 0.15);
    expect(ratio).toBeLessThan(DEFAULT_F1_RATE + 0.15);
  });

  it("coherencia tipo↔receptor: completa ⇒ receptor con NIF y nombre; ticket ⇒ sin receptor", () => {
    const sales = buildSales(300);
    const plan = selectInvoicePlan({ sales, targetCount: 200 });
    for (const item of plan) {
      if (item.invoiceType === "completa") {
        expect(item.recipient).not.toBeNull();
        expect(item.recipient!.taxId.trim().length).toBeGreaterThan(0);
        expect(item.recipient!.name.trim().length).toBeGreaterThan(0);
      } else {
        expect(item.recipient).toBeNull();
      }
    }
  });
});
