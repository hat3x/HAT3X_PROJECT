/**
 * Cálculo de totales e IVA por línea y por venta.
 *
 * ── Fuente única de verdad reutilizable por CAJA (TPV) y FACTURACIÓN ──────────
 * Toda la aritmética de una venta vive aquí. El TPV la usa para pintar el ticket
 * y persistir los snapshots (`pos_sales.*_cents`, `pos_sale_lines.line_total_cents`);
 * la facturación la reutiliza para el desglose de IVA por tipo que exige la
 * factura. Ni la UI ni las queries recalculan importes por su cuenta.
 *
 * ── Modelo de precios: BRUTO (PVP, IVA incluido) ─────────────────────────────
 * Los precios unitarios (`unit_price_cents`) son PVP con IVA incluido, coherente
 * con `pos_sale_lines.line_total_cents` = "IVA incluido, tras descuento" y con el
 * retail español. La base imponible y la cuota se EXTRAEN del bruto (ver money.ts).
 *
 * Mapeo a las columnas snapshot del esquema (§12, pos_*):
 *   línea → line_total_cents  = bruto de la línea (IVA incl., tras descuento)
 *   venta → subtotal_cents    = Σ base imponible (sin IVA)
 *           tax_cents         = Σ cuota de IVA
 *           discount_cents    = Σ descuentos de línea (informativo)
 *           total_cents       = Σ bruto  ≡  subtotal_cents + tax_cents
 *
 * Identidad contable garantizada por construcción: subtotal + tax === total.
 * (El esquema comenta "total = subtotal − descuento + IVA" para un modelo de
 *  precios NETO; aquí el descuento ya está aplicado dentro del bruto de cada
 *  línea, así que `discount_cents` se conserva solo como agregado informativo.)
 */
import {
  assertIntegerCents,
  multiplyCents,
  splitVatFromGross,
} from "./money";

/** Entrada mínima de una línea para calcular sus importes (agnóstica de la BD). */
export interface SaleLineInput {
  /** Cantidad vendida; admite fracciones (venta por peso). Debe ser > 0. */
  quantity: number;
  /** Precio unitario BRUTO en céntimos (PVP, IVA incluido). Entero ≥ 0. */
  unitPriceCents: number;
  /** Tipo de IVA en porcentaje (21, 10, 4, 0…). Por defecto 21 (general). */
  vatRate?: number;
  /** Descuento de la línea en céntimos BRUTOS. Entero ≥ 0. Por defecto 0. */
  discountCents?: number;
}

/** Importes calculados de una línea. `grossCents` es el `line_total_cents`. */
export interface SaleLineTotals {
  /** Bruto antes de descuento = quantity × unitPriceCents (redondeado). */
  grossBeforeDiscountCents: number;
  /** Descuento aplicado (nunca supera el bruto previo). */
  discountCents: number;
  /** Bruto tras descuento (IVA incl.) → `pos_sale_lines.line_total_cents`. */
  grossCents: number;
  /** Base imponible neta (sin IVA), extraída del bruto tras descuento. */
  baseCents: number;
  /** Cuota de IVA = grossCents − baseCents. */
  taxCents: number;
  /** Tipo de IVA aplicado (%), normalizado. */
  vatRate: number;
}

/** Totales agregados de una venta, listos para los snapshots de `pos_sales`. */
export interface SaleTotals {
  /** Σ base imponible → `subtotal_cents`. */
  subtotalCents: number;
  /** Σ descuentos de línea → `discount_cents` (informativo). */
  discountCents: number;
  /** Σ cuota de IVA → `tax_cents`. */
  taxCents: number;
  /** Σ bruto a cobrar → `total_cents` (≡ subtotal + tax). */
  totalCents: number;
  /** Desglose de IVA por tipo, para la factura. */
  vatBreakdown: VatBreakdownEntry[];
}

/** Una fila del desglose de IVA por tipo (base + cuota agrupadas por `vatRate`). */
export interface VatBreakdownEntry {
  /** Tipo de IVA en porcentaje. */
  vatRate: number;
  /** Base imponible acumulada a ese tipo. */
  baseCents: number;
  /** Cuota de IVA acumulada a ese tipo. */
  taxCents: number;
  /** Bruto acumulado a ese tipo (baseCents + taxCents). */
  grossCents: number;
}

const DEFAULT_VAT_RATE = 21;

/**
 * Calcula los importes de UNA línea. El descuento se satura al bruto previo
 * (nunca deja una línea negativa) y todo se resuelve en céntimos enteros.
 */
export function computeLineTotals(line: SaleLineInput): SaleLineTotals {
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new RangeError(`Cantidad de línea no válida: ${line.quantity}`);
  }
  assertIntegerCents(line.unitPriceCents, "unitPriceCents");
  if (line.unitPriceCents < 0) {
    throw new RangeError(`unitPriceCents no puede ser negativo: ${line.unitPriceCents}`);
  }

  const vatRate = line.vatRate ?? DEFAULT_VAT_RATE;
  const requestedDiscount = line.discountCents ?? 0;
  assertIntegerCents(requestedDiscount, "discountCents");
  if (requestedDiscount < 0) {
    throw new RangeError(`discountCents no puede ser negativo: ${requestedDiscount}`);
  }

  const grossBeforeDiscountCents = multiplyCents(line.unitPriceCents, line.quantity);
  // El descuento no puede dejar la línea en negativo: se satura al bruto previo.
  const discountCents = Math.min(requestedDiscount, grossBeforeDiscountCents);
  const grossCents = grossBeforeDiscountCents - discountCents;
  const { baseCents, taxCents } = splitVatFromGross(grossCents, vatRate);

  return {
    grossBeforeDiscountCents,
    discountCents,
    grossCents,
    baseCents,
    taxCents,
    vatRate,
  };
}

/**
 * Agrega una venta completa a partir de sus líneas: totales para `pos_sales` y
 * el desglose de IVA por tipo para la factura. Una venta sin líneas suma cero.
 */
export function computeSaleTotals(lines: readonly SaleLineInput[]): SaleTotals {
  const byRate = new Map<number, VatBreakdownEntry>();
  let subtotalCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  let totalCents = 0;

  for (const line of lines) {
    const totals = computeLineTotals(line);
    subtotalCents += totals.baseCents;
    discountCents += totals.discountCents;
    taxCents += totals.taxCents;
    totalCents += totals.grossCents;

    const entry = byRate.get(totals.vatRate) ?? {
      vatRate: totals.vatRate,
      baseCents: 0,
      taxCents: 0,
      grossCents: 0,
    };
    entry.baseCents += totals.baseCents;
    entry.taxCents += totals.taxCents;
    entry.grossCents += totals.grossCents;
    byRate.set(totals.vatRate, entry);
  }

  // Desglose ordenado de mayor a menor tipo (21 antes que 10, 4, 0) para la factura.
  const vatBreakdown = [...byRate.values()].sort((a, b) => b.vatRate - a.vatRate);

  return { subtotalCents, discountCents, taxCents, totalCents, vatBreakdown };
}
