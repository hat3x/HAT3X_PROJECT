/**
 * seed-demo-sales.ts — Generador PURO y DETERMINISTA del plan de VENTAS demo (sub-7).
 * ---------------------------------------------------------------------------
 * Fábrica de tickets del TPV (ventas de caja) a partir de las CITAS pasadas ya
 * completadas del salón demo ("Bella Studio"). Hermano de `seed-demo-appointments.ts`
 * (plan de citas): `scripts/seed-demo-salon.ts` lo consume para SEMBRAR las ventas
 * (`pos_sales` + `pos_sale_lines` + `pos_payments`) agrupadas en sesiones de caja
 * (`pos_sessions`, arqueo) por día y sede, de forma additiva e idempotente; los
 * tests lo importan para verificar sus invariantes SIN base de datos.
 *
 * REGLA DE ORO: módulo **puro**, sin acceso a BD, sin `process`, sin Node APIs, sin
 * `Math.random()` ni la hora de pared. Toda la aleatoriedad es un PRNG DETERMINISTA
 * sembrado por el `appointmentId` (UUID estable de la cita ya sembrada) y por la
 * clave de sesión, de modo que:
 *   · DETERMINISTA — misma entrada ⇒ mismo plan SIEMPRE. Requisito de la
 *     idempotencia del seed: al reejecutar, el dedup por `appointment_id` reconoce
 *     las ventas ya sembradas y este generador vuelve a producir exactamente los
 *     mismos importes/pagos para las que falten.
 *   · TESTEABLE — se importa tal cual desde Vitest (no arrastra el cliente admin).
 *
 * QUÉ MODELA (fiel a la petición del cliente):
 *   · LA MAYORÍA DE CITAS PASADAS GENERAN VENTA — el llamador solo le pasa las citas
 *     `completed`; cada una produce un ticket con su(s) línea(s) de servicio y, A
 *     VECES, una línea de producto retail (venta cruzada, ~30 %).
 *   · IMPORTES COHERENTES EN CÉNTIMOS — los totales salen de `computeSaleTotals`
 *     (`@/lib/payments`), la MISMA fuente que usa el TPV real (`createSale`) y la
 *     facturación, así ticket, líneas y desglose de IVA cuadran al céntimo.
 *   · MEZCLA DE MÉTODOS DE PAGO REALES — tarjeta (mayoría), efectivo y bizum, con
 *     algún pago MIXTO (efectivo + tarjeta). La suma de los pagos cubre EXACTAMENTE
 *     el total (invariante que la pasarela `manual` valida en producción).
 *   · SESIONES DE CAJA (ARQUEO) POR DÍA/SEDE — las ventas de una misma sede y día se
 *     agrupan en una `pos_sessions` con su fondo de caja, efectivo esperado, contado
 *     y descuadre (la mayoría cuadra; algunas tienen un pequeño descuadre realista).
 *
 * La resolución de IDs (cita/cliente/servicio/producto), la conversión de fechas a
 * instantes UTC y la ACREDITACIÓN de puntos de fidelización (replicando `awardVisit`)
 * las hace la capa de siembra en `seed-demo-salon.ts`. Ver `docs/seed-demo-contracts.md`
 * §2 (aritmética de venta) y §5 (fidelización). Las FACTURAS NO se emiten aquí: parte
 * de las ventas quedan como ticket simple (solo `pos_sales`) y una subtarea posterior
 * factura un subconjunto.
 */

import { computeLineTotals, computeSaleTotals, type SaleLineInput } from "@/lib/payments";

// ───────────────────────────────────────────────────────────────────────────
// Tipos de entrada.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Una cita PASADA ya completada, resuelta a IDs reales por la capa de siembra, que
 * es la base de un ticket. `servicePriceCents` es el snapshot de precio de la cita
 * (IVA incl.); `localDateStr`/`soldAtIso` los calcula el llamador con la zona del
 * salón (`localDateInZone` / `zonedWallTimeToUtc`).
 */
export interface DemoSaleAppointmentInput {
  /** Id (UUID) de la cita origen; ancla del dedup de ventas y semilla del PRNG. */
  appointmentId: string;
  /** Id del cliente atendido (para atribuir la venta y acreditar la visita). */
  customerId: string;
  /** Id del profesional que atendió (se atribuye a la venta). */
  professionalId: string;
  /** Id del servicio prestado (línea de servicio del ticket). */
  serviceId: string;
  /** Nombre del servicio en el momento de la venta (snapshot de `description`). */
  serviceName: string;
  /** PVP del servicio en céntimos (IVA incl.), snapshot de la cita. */
  servicePriceCents: number;
  /** Sede de la caja (de la que cuelga la sesión de arqueo). `null` = sin sede. */
  locationId: string | null;
  /** Fecha local del salón `YYYY-MM-DD` de la cita (clave de agrupación de sesión). */
  localDateStr: string;
  /** Instante de cobro en ISO 8601 UTC (normalmente el `ends_at` de la cita). */
  soldAtIso: string;
}

/** Un producto retail del catálogo demo (candidato a venta cruzada). */
export interface DemoRetailProduct {
  id: string;
  name: string;
  /** PVP unitario en céntimos (IVA incl.). */
  priceCents: number;
  /** Tipo de IVA (%) del producto (snapshot de la línea). */
  vatRate: number;
}

/** Parámetros del generador (todo inyectado ⇒ pureza y determinismo). */
export interface GenerateSalesParams {
  /** Citas completadas a convertir en ventas (ya deduplicadas por el llamador). */
  appointments: readonly DemoSaleAppointmentInput[];
  /** Catálogo de productos retail para la venta cruzada (puede ir vacío). */
  products: readonly DemoRetailProduct[];
  /** Probabilidad de añadir una línea de producto a un ticket. Por defecto 0.3. */
  productAttachRate?: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Tipos de salida (el plan que la capa de siembra materializa en la BD).
// ───────────────────────────────────────────────────────────────────────────

/** Método de pago demo: los 3 autoprovisionados por salón (`pos_payment_methods`). */
export type DemoTenderMethod = "efectivo" | "tarjeta" | "bizum";

/** IVA por defecto de los servicios (peluquería España): 21 %. */
export const SERVICE_VAT_RATE = 21;
/** Probabilidad por defecto de venta cruzada de producto en un ticket. */
export const DEFAULT_PRODUCT_ATTACH_RATE = 0.3;
/** Fondo de caja inicial de cada sesión de arqueo, en céntimos (150 €). */
export const OPENING_FLOAT_CENTS = 15_000;

/** Una línea del ticket (servicio o producto), con su snapshot de importe. */
export interface DemoSaleLine {
  kind: "service" | "product";
  /** Id del servicio o producto referenciado. */
  refId: string;
  /** Nombre en el momento de la venta (snapshot de `description`). */
  description: string;
  /** Cantidad vendida (entera ≥ 1 en el seed). */
  quantity: number;
  /** Precio unitario BRUTO en céntimos (PVP, IVA incl.). */
  unitPriceCents: number;
  /** Tipo de IVA aplicado (%), snapshot. */
  vatRate: number;
}

/** Un pago que liquida (parte de) el ticket. Varios = pago mixto. */
export interface DemoSaleTender {
  method: DemoTenderMethod;
  /** Importe aplicado en céntimos (> 0). */
  amountCents: number;
}

/** Un ticket completo listo para materializar en `pos_*`. */
export interface DemoSalePlan {
  appointmentId: string;
  customerId: string;
  professionalId: string;
  serviceId: string;
  /** Clave de la sesión de caja a la que pertenece: `${locationId|'none'}|${fecha}`. */
  sessionKey: string;
  locationId: string | null;
  localDateStr: string;
  soldAtIso: string;
  lines: DemoSaleLine[];
  tenders: DemoSaleTender[];
  /** Σ base imponible → `pos_sales.subtotal_cents`. */
  subtotalCents: number;
  /** Σ descuentos de línea → `pos_sales.discount_cents` (0 en el seed). */
  discountCents: number;
  /** Σ cuota de IVA → `pos_sales.tax_cents`. */
  taxCents: number;
  /** Σ bruto a cobrar → `pos_sales.total_cents` (≡ subtotal + tax). */
  totalCents: number;
}

/** Totales por método de una sesión (para el `closing_totals` del arqueo). */
export interface DemoSessionMethodTotals {
  efectivo: number;
  tarjeta: number;
  bizum: number;
}

/** Una sesión de caja (arqueo) que agrupa las ventas de una sede en un día. */
export interface DemoSessionPlan {
  sessionKey: string;
  locationId: string | null;
  localDateStr: string;
  /** Nº de ventas cobradas en la sesión. */
  saleCount: number;
  /** Snapshot de totales por método (→ `pos_sessions.closing_totals`). */
  totalsByMethod: DemoSessionMethodTotals;
  /** Fondo de caja inicial (→ `pos_sessions.opening_float_cents`). */
  openingFloatCents: number;
  /** Efectivo esperado = fondo + ventas en efectivo (→ `expected_cash_cents`). */
  expectedCashCents: number;
  /** Efectivo realmente contado en el arqueo (→ `counted_cash_cents`). */
  countedCashCents: number;
  /** Descuadre = contado − esperado (→ `cash_variance_cents`). Puede ser negativo. */
  cashVarianceCents: number;
}

/** Plan completo de ventas + sesiones de arqueo. */
export interface DemoSalesPlan {
  sales: DemoSalePlan[];
  sessions: DemoSessionPlan[];
}

// ───────────────────────────────────────────────────────────────────────────
// PRNG determinista (mulberry32) — mismo patrón que seed-demo-appointments.
// ───────────────────────────────────────────────────────────────────────────

/** Generador mulberry32: determinista, rápido y suficiente para datos ficticios. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla base fija del generador de ventas (distinta de citas/clientes). */
const BASE_SEED = 0x5a1e50ff;

/** Hash entero estable de un texto (FNV-1a) para sembrar el PRNG por clave. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Elige un elemento de un catálogo NO vacío (seguro bajo noUncheckedIndexedAccess). */
function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.floor(rng() * items.length) % items.length;
  const value = items[index];
  if (value === undefined) {
    throw new Error("pick: catálogo vacío (no debería ocurrir).");
  }
  return value;
}

// ───────────────────────────────────────────────────────────────────────────
// Composición de un ticket.
// ───────────────────────────────────────────────────────────────────────────

/** Una línea del plan → entrada de cálculo de la capa de pagos (bruto/IVA). */
function toLineInput(line: DemoSaleLine): SaleLineInput {
  return { quantity: line.quantity, unitPriceCents: line.unitPriceCents, vatRate: line.vatRate };
}

/**
 * Reparte el cobro del ticket en uno o varios pagos, cubriendo EXACTAMENTE el total:
 *   · single tender (mayoría): tarjeta ~55 %, efectivo ~30 %, bizum ~15 %.
 *   · pago MIXTO ocasional (~10 %, solo si el total ≥ 15 €): parte en efectivo
 *     (redondeada a euros) y el resto en tarjeta; ambos importes > 0.
 * La suma siempre es `totalCents` (no hay cobros parciales ni de más).
 */
function planTenders(rng: () => number, totalCents: number): DemoSaleTender[] {
  const wantsMixed = rng() >= 0.9 && totalCents >= 1_500;
  if (wantsMixed) {
    const cashFraction = 0.3 + rng() * 0.4; // 30 %–70 % en efectivo
    let cash = Math.round((totalCents * cashFraction) / 100) * 100; // a euros enteros
    if (cash < 100) cash = 100;
    if (cash > totalCents - 100) cash = totalCents - 100;
    const card = totalCents - cash;
    return [
      { method: "efectivo", amountCents: cash },
      { method: "tarjeta", amountCents: card },
    ];
  }

  const roll = rng();
  const method: DemoTenderMethod = roll < 0.55 ? "tarjeta" : roll < 0.85 ? "efectivo" : "bizum";
  return [{ method, amountCents: totalCents }];
}

/**
 * Construye el ticket de UNA cita: línea de servicio (snapshot de precio/IVA) y, con
 * probabilidad `productAttachRate`, una línea de producto retail. Los totales se
 * calculan con `computeSaleTotals` (fuente única). El PRNG se siembra por
 * `appointmentId` ⇒ el mismo ticket siempre.
 */
function planSale(
  appointment: DemoSaleAppointmentInput,
  products: readonly DemoRetailProduct[],
  productAttachRate: number,
): DemoSalePlan {
  const rng = mulberry32((BASE_SEED ^ hashString(appointment.appointmentId)) >>> 0);

  const lines: DemoSaleLine[] = [
    {
      kind: "service",
      refId: appointment.serviceId,
      description: appointment.serviceName,
      quantity: 1,
      unitPriceCents: appointment.servicePriceCents,
      vatRate: SERVICE_VAT_RATE,
    },
  ];

  // Venta cruzada de producto (a veces): 1 unidad, o 2 de forma ocasional.
  if (products.length > 0 && rng() < productAttachRate) {
    const product = pick(rng, products);
    const quantity = rng() < 0.15 ? 2 : 1;
    lines.push({
      kind: "product",
      refId: product.id,
      description: product.name,
      quantity,
      unitPriceCents: product.priceCents,
      vatRate: product.vatRate,
    });
  }

  const totals = computeSaleTotals(lines.map(toLineInput));
  const tenders = planTenders(rng, totals.totalCents);
  const sessionKey = `${appointment.locationId ?? "none"}|${appointment.localDateStr}`;

  return {
    appointmentId: appointment.appointmentId,
    customerId: appointment.customerId,
    professionalId: appointment.professionalId,
    serviceId: appointment.serviceId,
    sessionKey,
    locationId: appointment.locationId,
    localDateStr: appointment.localDateStr,
    soldAtIso: appointment.soldAtIso,
    lines,
    tenders,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Sesiones de caja (arqueo).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cierra el arqueo de una sesión: efectivo esperado = fondo + ventas en efectivo;
 * contado = esperado + un descuadre pequeño y realista (la mayoría de días cuadra;
 * algunos faltan/sobran unos euros). Determinista por `sessionKey`. `counted` nunca
 * es negativo (el fondo de caja lo garantiza en la práctica; se satura por si acaso).
 */
function planSessionArqueo(
  sessionKey: string,
  cashSalesCents: number,
): {
  openingFloatCents: number;
  expectedCashCents: number;
  countedCashCents: number;
  cashVarianceCents: number;
} {
  const openingFloatCents = OPENING_FLOAT_CENTS;
  const expectedCashCents = openingFloatCents + cashSalesCents;

  const rng = mulberry32((BASE_SEED ^ hashString(`arqueo:${sessionKey}`)) >>> 0);
  const roll = rng();
  let variance = 0;
  if (roll >= 0.72) {
    // Descuadre de 0,05 €–3,00 €; ~18 % falta (−), ~10 % sobra (+).
    const magnitude = 5 + Math.floor(rng() * 296);
    variance = roll < 0.9 ? -magnitude : magnitude;
  }

  let countedCashCents = expectedCashCents + variance;
  if (countedCashCents < 0) countedCashCents = 0;
  return {
    openingFloatCents,
    expectedCashCents,
    countedCashCents,
    cashVarianceCents: countedCashCents - expectedCashCents,
  };
}

/** Agrega las ventas en sesiones de caja por (sede, día) con su arqueo cerrado. */
function planSessions(sales: readonly DemoSalePlan[]): DemoSessionPlan[] {
  interface Acc {
    sessionKey: string;
    locationId: string | null;
    localDateStr: string;
    saleCount: number;
    totalsByMethod: DemoSessionMethodTotals;
  }
  const byKey = new Map<string, Acc>();

  for (const sale of sales) {
    let acc = byKey.get(sale.sessionKey);
    if (acc === undefined) {
      acc = {
        sessionKey: sale.sessionKey,
        locationId: sale.locationId,
        localDateStr: sale.localDateStr,
        saleCount: 0,
        totalsByMethod: { efectivo: 0, tarjeta: 0, bizum: 0 },
      };
      byKey.set(sale.sessionKey, acc);
    }
    acc.saleCount += 1;
    for (const tender of sale.tenders) {
      acc.totalsByMethod[tender.method] += tender.amountCents;
    }
  }

  const sessions: DemoSessionPlan[] = [];
  for (const acc of byKey.values()) {
    const arqueo = planSessionArqueo(acc.sessionKey, acc.totalsByMethod.efectivo);
    sessions.push({
      sessionKey: acc.sessionKey,
      locationId: acc.locationId,
      localDateStr: acc.localDateStr,
      saleCount: acc.saleCount,
      totalsByMethod: acc.totalsByMethod,
      ...arqueo,
    });
  }
  return sessions;
}

// ───────────────────────────────────────────────────────────────────────────
// Generador principal.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Genera el plan de ventas demo: un ticket por cita completada + las sesiones de
 * caja (arqueo) que las agrupan por sede y día. DETERMINISTA: cada ticket se siembra
 * por su `appointmentId`, así que reejecutar produce EXACTAMENTE el mismo plan (clave
 * de la idempotencia additiva del seed).
 */
export function generateDemoSales(params: GenerateSalesParams): DemoSalesPlan {
  const { appointments, products, productAttachRate = DEFAULT_PRODUCT_ATTACH_RATE } = params;

  const sales = appointments.map((appointment) =>
    planSale(appointment, products, productAttachRate),
  );
  const sessions = planSessions(sales);
  return { sales, sessions };
}

/**
 * Puntos que acredita un ticket, por línea, para la fidelización. Reutiliza el bruto
 * por línea de `computeLineTotals` (idéntico al `line_total_cents` persistido), que
 * es el `price_cents` que consume la matemática pura de puntos (`computeVisitPoints`,
 * regla por defecto `ceil(price_cents / 200)`). La capa de siembra lo usa para
 * replicar `awardVisit` sin reimplementar la aritmética (ver contratos §5).
 */
export function saleLoyaltyLineItems(
  sale: DemoSalePlan,
): { price_cents: number; label: string }[] {
  return sale.lines.map((line) => ({
    price_cents: computeLineTotals(toLineInput(line)).grossCents,
    label: line.description,
  }));
}
