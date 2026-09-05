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
  distributeProportionally,
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
/**
 * Devuelve las líneas como OPERACIÓN EXENTA de IVA: mismo precio, tipo 0.
 *
 * ── La sutileza que hay detrás ───────────────────────────────────────────────
 * En Kairos el precio es BRUTO: los 290 € de una corona ya llevan el IVA dentro
 * y la cuota se EXTRAE de ahí. Por eso "quitar el IVA" tiene dos lecturas
 * opuestas, y solo una es la correcta:
 *
 *   · restar la cuota  → el paciente pagaría 239,67 € en vez de 290 €. Eso no
 *     es una exención, es regalarle a la clínica el 21 % de cada trabajo.
 *   · poner el tipo a 0 → sigue pagando 290 €, pero esos 290 € son base
 *     imponible entera con cuota 0. Esto es lo que significa exento: el
 *     honorario es el honorario y la operación no lleva impuesto.
 *
 * Se aplica a TODAS las líneas porque la exención es de la operación, no de un
 * concepto suelto. Devuelve líneas nuevas: no toca las que recibe, para que el
 * ticket en pantalla pueda volver a mostrarse con IVA si se desmarca la
 * casilla.
 *
 * Ojo, quien emita la factura debe hacer constar el motivo de la exención: una
 * factura exenta sin la mención legal está formalmente incompleta.
 */
export function applyVatExemption(lines: readonly SaleLineInput[]): SaleLineInput[] {
  return lines.map((line) => ({ ...line, vatRate: 0 }));
}

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

/**
 * Aplica un descuento de TICKET (p. ej. el cupón de bienvenida) prorrateándolo
 * entre las líneas en proporción a su bruto, y devuelve NUEVAS líneas con ese
 * reparto acumulado en `discountCents`.
 *
 * ── Por qué así y no "restando al total" ─────────────────────────────────────
 * El descuento del cupón es un % sobre el bruto del ticket, pero el ticket mezcla
 * tipos de IVA (21/10/4/0). Restarlo del total dejaría la base y la cuota sin
 * cuadrar (un "parche visual"). En su lugar se reparte a nivel de LÍNEA por el
 * método del mayor resto ({@link distributeProportionally}), de modo que al pasar
 * el resultado por {@link computeSaleTotals} la base imponible, el IVA por tipo y
 * el total se recalculan solos y siguen cumpliendo, EXACTOS en céntimos enteros:
 *   · `subtotal + IVA === total`  (por construcción de `splitVatFromGross`)
 *   · `Σ bruto de línea === total`  (no se pierde ni se inventa un céntimo)
 *   · `Σ descuento de línea === descuento aplicado`
 *
 * El descuento se satura al bruto total (nunca deja el ticket en negativo). Las
 * líneas se ponderan por su bruto TRAS su propio descuento de línea, así el cupón
 * reparte sobre lo que realmente se cobra. Devuelve copias (no muta la entrada).
 */
export function prorateDiscountAcrossLines(
  lines: readonly SaleLineInput[],
  discountCents: number,
): SaleLineInput[] {
  assertIntegerCents(discountCents, "discountCents");
  if (discountCents < 0) {
    throw new RangeError(`discountCents no puede ser negativo: ${discountCents}`);
  }
  if (discountCents === 0) {
    return lines.map((line) => ({ ...line }));
  }

  const grossPerLine = lines.map((line) => computeLineTotals(line).grossCents);
  const totalGross = grossPerLine.reduce((acc, gross) => acc + gross, 0);
  // El cupón nunca descuenta más que el bruto disponible.
  const applied = Math.min(discountCents, totalGross);
  const shares = distributeProportionally(applied, grossPerLine);

  return lines.map((line, i) => ({
    ...line,
    discountCents: (line.discountCents ?? 0) + shares[i]!,
  }));
}
