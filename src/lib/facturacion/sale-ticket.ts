/**
 * Detalle de una VENTA (`pos_sales` + líneas + cobros) y su reconstrucción como
 * TICKET IMPRIMIBLE — helpers PUROS (sub-7). Sin React ni red: solo normalización,
 * agregación y mapeo. Los comparten la página de detalle (Server Component), el
 * endpoint de reimpresión (`/api/facturacion/ticket/[id]`) y sus tests.
 *
 * ── Por qué aquí y no en `rows.ts` ────────────────────────────────────────────
 * `rows.ts` modela la FILA de la tabla (cabecera de la venta). Este módulo modela
 * el DETALLE (líneas + cobros + desglose de IVA) y la "foto" que necesita el
 * documento térmico del TPV. Se separa para que cada uno tenga una única razón de
 * cambio y para no inflar el módulo de filas.
 *
 * ── Fuente de verdad del dinero ───────────────────────────────────────────────
 * El dinero viaja en céntimos enteros (`*_cents`). NO se recalculan los totales:
 * se usan los snapshots ya cerrados por la caja (`subtotal_cents`, `tax_cents`,
 * `total_cents`, `discount_cents`). El desglose de IVA por tipo se DERIVA de las
 * líneas SOLO para repartir esos totales entre los tipos presentes, de forma que
 * la suma de bases y de cuotas cuadra EXACTAMENTE con el snapshot de la venta.
 *
 * Origen de SOLO LECTURA: una venta cerrada es un registro; aquí nunca se escribe.
 */
import {
  PAYMENT_METHOD_LABEL,
  embeddedOne,
  summarizePaymentMethods,
  type PaymentSummary,
} from "@/lib/facturacion/rows";
import type {
  TicketDocumentData,
  TicketDocumentTender,
} from "@/lib/tpv/ticket-document";
import type { PosPaymentMethod, PosSaleStatus } from "@/types/database";

/** Relación embebida "a-uno" tal como puede llegar de PostgREST. */
type Embedded<T> = T | T[] | null;

// ── Formas crudas (consulta) ──────────────────────────────────────────────────

/** Línea cruda de `pos_sale_lines` (importe de línea BRUTO, IVA incluido). */
export interface RawSaleLine {
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
  line_total_cents: number;
  created_at: string;
}

/** Cobro crudo de `pos_payments`. */
export interface RawSalePayment {
  method: PosPaymentMethod;
  amount_cents: number;
  paid_at: string;
}

/** Venta cruda con sus líneas, cobros y relaciones embebidas. */
export interface RawSaleDetail {
  id: string;
  sold_at: string;
  status: PosSaleStatus;
  currency: string;
  /** Base imponible (Σ bases, POST-descuento) — snapshot de la caja. */
  subtotal_cents: number;
  /** Descuento a nivel de venta (p. ej. cupón de bienvenida). */
  discount_cents: number;
  /** IVA total (Σ cuotas) — snapshot de la caja. */
  tax_cents: number;
  /** Total realmente cobrado — snapshot de la caja. */
  total_cents: number;
  notes: string | null;
  professional: Embedded<{ full_name: string }>;
  customer: Embedded<{ full_name: string }>;
  session: Embedded<{ location: Embedded<{ name: string }> }>;
  lines: RawSaleLine[] | null;
  payments: RawSalePayment[] | null;
}

// ── Modelo de vista (detalle) ─────────────────────────────────────────────────

/** Una línea del detalle, ya normalizada a céntimos. */
export interface SaleDetailLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  lineTotalCents: number;
}

/** Un cobro del detalle (una fila por tender: pago simple o mixto). */
export interface SaleDetailPayment {
  method: PosPaymentMethod;
  label: string;
  amountCents: number;
}

/** Una fila del desglose de IVA por tipo (base + cuota agrupadas). */
export interface SaleVatRow {
  vatRate: number;
  baseCents: number;
  taxCents: number;
}

/** Detalle completo de una venta cerrada, listo para pintar y para reimprimir. */
export interface SaleDetail {
  id: string;
  soldAt: string;
  status: PosSaleStatus;
  currency: string;
  locationName: string | null;
  professionalName: string | null;
  customerName: string | null;
  lines: SaleDetailLine[];
  payments: SaleDetailPayment[];
  payment: PaymentSummary;
  /** Bruto del ticket ANTES del descuento (Σ de las líneas). */
  grossTotalCents: number;
  /** Descuento a nivel de venta (0 si no hubo). */
  discountCents: number;
  /** Base imponible (POST-descuento) — snapshot. */
  taxableBaseCents: number;
  /** IVA total — snapshot. */
  taxCents: number;
  /** Total cobrado — snapshot. */
  totalCents: number;
  /** Desglose de IVA por tipo, derivado de las líneas y cuadrado al snapshot. */
  vatBreakdown: SaleVatRow[];
  notes: string | null;
}

/**
 * Referencia legible y corta de una venta (prefijo del id, en mayúsculas), igual
 * criterio que el nº de ticket del TPV. No es un número fiscal: es un localizador.
 */
export function formatSaleRef(saleId: string): string {
  return saleId.slice(0, 8).toUpperCase();
}

/**
 * Deriva el desglose de IVA por tipo a partir de las líneas, repartiendo los
 * totales AUTORITATIVOS de la venta (`taxableBaseCents`, `taxCents`) entre los
 * tipos presentes en proporción al bruto de cada tipo.
 *
 * El reparto proporcional con AJUSTE DEL RESTO en el último tipo garantiza que
 * `Σ bases === taxableBaseCents` y `Σ cuotas === taxCents` al céntimo (nunca se
 * introduce descuadre por redondeo). Con un único tipo de IVA el reparto es
 * exacto por construcción.
 */
export function computeVatBreakdown(
  lines: ReadonlyArray<Pick<SaleDetailLine, "vatRate" | "lineTotalCents">>,
  taxableBaseCents: number,
  taxCents: number,
): SaleVatRow[] {
  // Bruto acumulado por tipo de IVA.
  const grossByRate = new Map<number, number>();
  for (const line of lines) {
    grossByRate.set(line.vatRate, (grossByRate.get(line.vatRate) ?? 0) + line.lineTotalCents);
  }

  const rates = [...grossByRate.keys()].sort((a, b) => a - b);
  const totalGross = rates.reduce((sum, rate) => sum + (grossByRate.get(rate) ?? 0), 0);
  if (rates.length === 0 || totalGross === 0) return [];

  let baseAssigned = 0;
  let taxAssigned = 0;
  return rates.map((rate, index) => {
    const gross = grossByRate.get(rate) ?? 0;
    const isLast = index === rates.length - 1;
    const baseCents = isLast
      ? taxableBaseCents - baseAssigned
      : Math.round((taxableBaseCents * gross) / totalGross);
    const taxRowCents = isLast
      ? taxCents - taxAssigned
      : Math.round((taxCents * gross) / totalGross);
    baseAssigned += baseCents;
    taxAssigned += taxRowCents;
    return { vatRate: rate, baseCents, taxCents: taxRowCents };
  });
}

/** Normaliza una línea cruda a la línea del detalle. */
function toDetailLine(raw: RawSaleLine): SaleDetailLine {
  return {
    description: raw.description,
    quantity: raw.quantity,
    unitPriceCents: raw.unit_price_cents,
    vatRate: raw.vat_rate,
    lineTotalCents: raw.line_total_cents,
  };
}

/** Normaliza un cobro crudo al cobro del detalle (con su etiqueta es-ES). */
function toDetailPayment(raw: RawSalePayment): SaleDetailPayment {
  return {
    method: raw.method,
    label: PAYMENT_METHOD_LABEL[raw.method],
    amountCents: raw.amount_cents,
  };
}

/**
 * Normaliza una venta cruda (con líneas, cobros y embebidos) al detalle de vista.
 * Las líneas se ordenan por `created_at` y los cobros por `paid_at` para un orden
 * estable y determinista, independiente del orden de la consulta.
 */
export function toSaleDetail(raw: RawSaleDetail): SaleDetail {
  const session = embeddedOne(raw.session);
  const location = session !== null ? embeddedOne(session.location) : null;
  const professional = embeddedOne(raw.professional);
  const customer = embeddedOne(raw.customer);

  const rawLines = [...(raw.lines ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const rawPayments = [...(raw.payments ?? [])].sort((a, b) =>
    a.paid_at.localeCompare(b.paid_at),
  );

  const lines = rawLines.map(toDetailLine);
  const grossTotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

  return {
    id: raw.id,
    soldAt: raw.sold_at,
    status: raw.status,
    currency: raw.currency,
    locationName: location?.name ?? null,
    professionalName: professional?.full_name ?? null,
    customerName: customer?.full_name ?? null,
    lines,
    payments: rawPayments.map(toDetailPayment),
    payment: summarizePaymentMethods(rawPayments),
    grossTotalCents,
    discountCents: raw.discount_cents,
    taxableBaseCents: raw.subtotal_cents,
    taxCents: raw.tax_cents,
    totalCents: raw.total_cents,
    vatBreakdown: computeVatBreakdown(lines, raw.subtotal_cents, raw.tax_cents),
    notes: raw.notes,
  };
}

/**
 * Reconstruye la "foto" imprimible del ticket ({@link TicketDocumentData}) a
 * partir del detalle de una venta cerrada, para REIMPRIMIR reutilizando el mismo
 * generador térmico del TPV (`@/lib/tpv/ticket-document`).
 *
 * El descuento a nivel de venta se representa como el bloque de cupón del ticket
 * (subtotal previo + descuento), con el porcentaje DERIVADO del importe sobre el
 * bruto — coherente con el modelo de cupón único del TPV. La fidelización queda a
 * `null`: en una reimpresión no se re-acreditan puntos (el ticket es informativo,
 * "no es una factura"); lo relevante aquí son LÍNEAS y COBROS.
 */
export function buildSaleTicketData(
  detail: SaleDetail,
  options: { salonName: string },
): TicketDocumentData {
  const coupon =
    detail.discountCents > 0
      ? {
          percentOff:
            detail.grossTotalCents > 0
              ? Math.round((detail.discountCents / detail.grossTotalCents) * 100)
              : 0,
          discountCents: detail.discountCents,
        }
      : null;

  const tenders: TicketDocumentTender[] = detail.payments.map((payment) => ({
    label: payment.label,
    amountCents: payment.amountCents,
  }));

  return {
    salonName: options.salonName,
    ticketRef: formatSaleRef(detail.id),
    issuedAt: new Date(detail.soldAt),
    currency: detail.currency,
    lines: detail.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      vatRate: line.vatRate,
      lineTotalCents: line.lineTotalCents,
    })),
    grossTotalCents: detail.grossTotalCents,
    coupon,
    taxableBaseCents: detail.taxableBaseCents,
    vatBreakdown: detail.vatBreakdown.map((row) => ({
      vatRate: row.vatRate,
      baseCents: row.baseCents,
      taxCents: row.taxCents,
    })),
    totalCents: detail.totalCents,
    tenders,
    loyalty: null,
    notes: detail.notes,
  };
}
