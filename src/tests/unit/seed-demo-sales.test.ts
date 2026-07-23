/**
 * Tests unitarios del generador PURO de VENTAS demo (`scripts/seed-demo-sales`).
 *
 * El generador alimenta el paso `seedSales` de `scripts/seed-demo-salon.ts` (sub-7).
 * Su contrato con el ESQUEMA del TPV y con la capa de pagos es estricto y aquí se
 * blinda SIN base de datos:
 *   · IMPORTES COHERENTES — `subtotal + tax === total` y `total > 0` en cada ticket
 *     (los calcula `computeSaleTotals`, la fuente única del TPV real y la factura).
 *   · COBRO EXACTO — la suma de los pagos cubre EXACTAMENTE el total (invariante que
 *     la pasarela `manual` valida en producción); cada importe de pago es > 0.
 *   · MÉTODOS REALES — efectivo/tarjeta/bizum; el pago MIXTO solo aparece en tickets
 *     de importe suficiente (≥ 15 €) y reparte efectivo + tarjeta.
 *   · ARQUEO POR SEDE/DÍA — una sesión por (sede, fecha local); su efectivo esperado
 *     = fondo + ventas en efectivo, el contado ≥ 0 y el descuadre = contado − esperado.
 *   · DETERMINISMO — requisito de la idempotencia additiva del seed (reejecutar no
 *     debe generar ventas distintas): misma entrada ⇒ mismo plan.
 *
 * No toca la base de datos: la resolución de IDs, la persistencia y la acreditación
 * de puntos (que replica `awardVisit`) se ejercitan en la siembra real, no aquí.
 */
import { describe, it, expect } from "vitest";

import {
  DEFAULT_PRODUCT_ATTACH_RATE,
  OPENING_FLOAT_CENTS,
  SERVICE_VAT_RATE,
  generateDemoSales,
  saleLoyaltyLineItems,
  type DemoRetailProduct,
  type DemoSaleAppointmentInput,
} from "../../../scripts/seed-demo-sales";

/** Catálogo de productos de referencia (subconjunto del catálogo demo real). */
const PRODUCTS: DemoRetailProduct[] = [
  { id: "prod-0", name: "Champú hidratante 300 ml", priceCents: 1650, vatRate: 21 },
  { id: "prod-1", name: "Aceite de argán 100 ml", priceCents: 2400, vatRate: 21 },
  { id: "prod-2", name: "Mascarilla nutritiva 250 ml", priceCents: 2200, vatRate: 21 },
];

/** Servicios de referencia (nombre + PVP en céntimos) con precios variados. */
const SERVICES: readonly { name: string; priceCents: number }[] = [
  { name: "Corte caballero", priceCents: 1700 },
  { name: "Arreglo de flequillo", priceCents: 700 },
  { name: "Color completo", priceCents: 5400 },
  { name: "Balayage", priceCents: 9800 },
  { name: "Tratamiento de keratina", priceCents: 12000 },
];

/** Dos sedes y varias fechas de apertura (deterministas). */
const LOCATIONS = ["loc-centro", "loc-norte"] as const;
const DATES = ["2026-03-14", "2026-03-16", "2026-04-02", "2026-04-03"] as const;

/**
 * Construye un lote determinista de citas completadas variadas (distintas sedes,
 * fechas, servicios, clientes) para ejercitar todas las ramas del generador.
 */
function buildAppointments(count: number): DemoSaleAppointmentInput[] {
  const appointments: DemoSaleAppointmentInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const service = SERVICES[i % SERVICES.length]!;
    const locationId = LOCATIONS[i % LOCATIONS.length]!;
    const localDateStr = DATES[i % DATES.length]!;
    const hour = 9 + (i % 10);
    appointments.push({
      appointmentId: `appt-${String(i).padStart(3, "0")}`,
      customerId: `cust-${String(i % 7).padStart(2, "0")}`, // reutiliza clientes (recurrentes)
      professionalId: `pro-${i % 4}`,
      serviceId: `svc-${i % SERVICES.length}`,
      serviceName: service.name,
      servicePriceCents: service.priceCents,
      locationId,
      localDateStr,
      soldAtIso: `${localDateStr}T${String(hour).padStart(2, "0")}:30:00.000Z`,
    });
  }
  return appointments;
}

const TENDER_METHODS = new Set(["efectivo", "tarjeta", "bizum"]);

describe("generateDemoSales — invariantes por ticket", () => {
  const appointments = buildAppointments(80);
  const { sales } = generateDemoSales({ appointments, products: PRODUCTS });

  it("genera exactamente un ticket por cita (misma atribución)", () => {
    expect(sales).toHaveLength(appointments.length);
    for (let i = 0; i < sales.length; i += 1) {
      const sale = sales[i]!;
      const appt = appointments[i]!;
      expect(sale.appointmentId).toBe(appt.appointmentId);
      expect(sale.customerId).toBe(appt.customerId);
      expect(sale.professionalId).toBe(appt.professionalId);
      expect(sale.serviceId).toBe(appt.serviceId);
      expect(sale.soldAtIso).toBe(appt.soldAtIso);
      expect(sale.sessionKey).toBe(`${appt.locationId}|${appt.localDateStr}`);
    }
  });

  it("cumple la identidad contable subtotal + tax === total y total > 0", () => {
    for (const sale of sales) {
      expect(sale.totalCents).toBeGreaterThan(0);
      expect(sale.subtotalCents + sale.taxCents).toBe(sale.totalCents);
      expect(sale.discountCents).toBe(0); // el seed no aplica descuentos
    }
  });

  it("el total del ticket es la suma del bruto de sus líneas", () => {
    for (const sale of sales) {
      const grossFromItems = saleLoyaltyLineItems(sale).reduce(
        (acc, item) => acc + item.price_cents,
        0,
      );
      expect(grossFromItems).toBe(sale.totalCents);
    }
  });

  it("los pagos cubren EXACTAMENTE el total, con importes > 0 y métodos reales", () => {
    for (const sale of sales) {
      expect(sale.tenders.length).toBeGreaterThan(0);
      let paid = 0;
      for (const tender of sale.tenders) {
        expect(tender.amountCents).toBeGreaterThan(0);
        expect(TENDER_METHODS.has(tender.method)).toBe(true);
        paid += tender.amountCents;
      }
      expect(paid).toBe(sale.totalCents);
    }
  });

  it("el pago mixto solo aparece en tickets ≥ 15 € y reparte efectivo + tarjeta", () => {
    for (const sale of sales) {
      if (sale.tenders.length > 1) {
        expect(sale.tenders).toHaveLength(2);
        expect(sale.totalCents).toBeGreaterThanOrEqual(1_500);
        expect(sale.tenders.map((t) => t.method).sort()).toEqual(["efectivo", "tarjeta"]);
      }
    }
  });

  it("cada ticket lleva su línea de servicio (snapshot de precio/IVA)", () => {
    for (const sale of sales) {
      const serviceLine = sale.lines.find((line) => line.kind === "service");
      expect(serviceLine).toBeDefined();
      expect(serviceLine!.quantity).toBe(1);
      expect(serviceLine!.vatRate).toBe(SERVICE_VAT_RATE);
      const appt = appointments.find((a) => a.appointmentId === sale.appointmentId)!;
      expect(serviceLine!.refId).toBe(appt.serviceId);
      expect(serviceLine!.unitPriceCents).toBe(appt.servicePriceCents);
    }
  });

  it("saleLoyaltyLineItems devuelve el bruto y la etiqueta de cada línea", () => {
    for (const sale of sales) {
      const items = saleLoyaltyLineItems(sale);
      expect(items).toHaveLength(sale.lines.length);
      items.forEach((item, i) => {
        expect(item.label).toBe(sale.lines[i]!.description);
        expect(Number.isInteger(item.price_cents)).toBe(true);
        expect(item.price_cents).toBeGreaterThan(0);
      });
    }
  });
});

describe("generateDemoSales — venta cruzada de producto", () => {
  const appointments = buildAppointments(40);

  it("con productAttachRate 0 ningún ticket lleva producto", () => {
    const { sales } = generateDemoSales({
      appointments,
      products: PRODUCTS,
      productAttachRate: 0,
    });
    for (const sale of sales) {
      expect(sale.lines).toHaveLength(1);
      expect(sale.lines[0]!.kind).toBe("service");
    }
  });

  it("con productAttachRate 1 todos los tickets llevan una línea de producto válida", () => {
    const { sales } = generateDemoSales({
      appointments,
      products: PRODUCTS,
      productAttachRate: 1,
    });
    const productIds = new Set(PRODUCTS.map((p) => p.id));
    for (const sale of sales) {
      expect(sale.lines).toHaveLength(2);
      const productLine = sale.lines.find((line) => line.kind === "product")!;
      expect(productLine).toBeDefined();
      expect(productIds.has(productLine.refId)).toBe(true);
      expect([1, 2]).toContain(productLine.quantity);
    }
  });

  it("sin catálogo de productos nunca añade línea de producto (aunque la tasa sea 1)", () => {
    const { sales } = generateDemoSales({ appointments, products: [], productAttachRate: 1 });
    for (const sale of sales) {
      expect(sale.lines).toHaveLength(1);
    }
  });

  it("la tasa por defecto produce ventas cruzadas en una fracción de los tickets", () => {
    const { sales } = generateDemoSales({
      appointments: buildAppointments(200),
      products: PRODUCTS,
    });
    const withProduct = sales.filter((sale) => sale.lines.length > 1).length;
    expect(withProduct).toBeGreaterThan(0);
    expect(withProduct).toBeLessThan(sales.length); // no todos: es "a veces"
    // Debe rondar la tasa por defecto (±0.2 de margen para el ruido del PRNG).
    const ratio = withProduct / sales.length;
    expect(ratio).toBeGreaterThan(DEFAULT_PRODUCT_ATTACH_RATE - 0.2);
    expect(ratio).toBeLessThan(DEFAULT_PRODUCT_ATTACH_RATE + 0.2);
  });
});

describe("generateDemoSales — sesiones de caja (arqueo)", () => {
  const appointments = buildAppointments(120);
  const { sales, sessions } = generateDemoSales({ appointments, products: PRODUCTS });

  it("hay una sesión por (sede, día) y agrupa todas sus ventas", () => {
    const expectedKeys = new Set(sales.map((sale) => sale.sessionKey));
    expect(sessions).toHaveLength(expectedKeys.size);
    for (const session of sessions) {
      const saleCount = sales.filter((sale) => sale.sessionKey === session.sessionKey).length;
      expect(session.saleCount).toBe(saleCount);
      expect(session.sessionKey).toBe(`${session.locationId}|${session.localDateStr}`);
    }
  });

  it("los totales por método cuadran con la suma de los tickets de la sesión", () => {
    for (const session of sessions) {
      const sessionSales = sales.filter((sale) => sale.sessionKey === session.sessionKey);
      const salesTotal = sessionSales.reduce((acc, sale) => acc + sale.totalCents, 0);
      const methodTotal =
        session.totalsByMethod.efectivo +
        session.totalsByMethod.tarjeta +
        session.totalsByMethod.bizum;
      expect(methodTotal).toBe(salesTotal);
    }
  });

  it("el arqueo es coherente: esperado = fondo + efectivo, contado ≥ 0, descuadre = contado − esperado", () => {
    for (const session of sessions) {
      expect(session.openingFloatCents).toBe(OPENING_FLOAT_CENTS);
      expect(session.expectedCashCents).toBe(
        session.openingFloatCents + session.totalsByMethod.efectivo,
      );
      expect(session.countedCashCents).toBeGreaterThanOrEqual(0);
      expect(session.cashVarianceCents).toBe(
        session.countedCashCents - session.expectedCashCents,
      );
      expect(Math.abs(session.cashVarianceCents)).toBeLessThanOrEqual(300);
    }
  });

  it("la mayoría de las sesiones cuadra (descuadre 0)", () => {
    const squared = sessions.filter((session) => session.cashVarianceCents === 0).length;
    expect(squared).toBeGreaterThan(sessions.length / 2);
  });
});

describe("generateDemoSales — determinismo e idempotencia", () => {
  it("misma entrada ⇒ plan idéntico (deep equal)", () => {
    const appointments = buildAppointments(60);
    const first = generateDemoSales({ appointments, products: PRODUCTS });
    const second = generateDemoSales({ appointments, products: PRODUCTS });
    expect(second).toEqual(first);
  });

  it("el ticket depende del appointmentId (semilla estable), no del orden", () => {
    const appointments = buildAppointments(30);
    const shuffled = [...appointments].reverse();
    const base = generateDemoSales({ appointments, products: PRODUCTS });
    const rev = generateDemoSales({ appointments: shuffled, products: PRODUCTS });
    const byId = new Map(base.sales.map((sale) => [sale.appointmentId, sale]));
    for (const sale of rev.sales) {
      expect(sale).toEqual(byId.get(sale.appointmentId));
    }
  });

  it("una lista vacía de citas produce un plan vacío", () => {
    const plan = generateDemoSales({ appointments: [], products: PRODUCTS });
    expect(plan.sales).toHaveLength(0);
    expect(plan.sessions).toHaveLength(0);
  });
});
