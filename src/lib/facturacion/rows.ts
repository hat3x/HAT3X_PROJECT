/**
 * Modelo de fila y helpers PUROS de las tablas de facturación: FACTURAS
 * (`pos_invoices`) y TICKETS / VENTAS (`pos_sales`). Sin React ni red: solo
 * normalización y etiquetado de dominio. Los comparten los componentes de tabla
 * (Server Components) y sus tests.
 *
 * Invariante del esquema (§1.6): el dinero viaja SIEMPRE en céntimos enteros
 * (`*_cents`). Estas filas solo lo TRANSPORTAN tal cual; el formateo a moneda es
 * de la vista, con `formatMoney` de `@/lib/format` (que a su vez respeta el
 * modelo de céntimos de `@/lib/payments/money`). NO se recalcula ningún importe:
 * se usan los snapshots ya cerrados por la caja / el motor de facturación.
 *
 * Ambos orígenes son de SOLO LECTURA. `pos_invoices` es además INMUTABLE a nivel
 * de motor (trigger que aborta UPDATE/DELETE): aquí nunca se escribe.
 */
import type {
  Json,
  PosInvoiceType,
  PosPaymentMethod,
  PosSaleStatus,
} from "@/types/database";

/** Variantes del componente `Badge` (espejo del union de `@/components/ui/badge`). */
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Normaliza una relación embebida "a-uno" de PostgREST, que según el caso y la
 * inferencia de tipos llega como objeto, como array de un elemento o como `null`.
 * Devuelve el objeto (o `null`), de modo que la lectura posterior es uniforme.
 */
export function embeddedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ── FACTURAS (pos_invoices) ───────────────────────────────────────────────────

/**
 * Código AEAT del tipo de factura Veri*factu:
 *   · `completa` → **F1** (factura ordinaria, con receptor)
 *   · `ticket`   → **F2** (factura simplificada, sin receptor)
 * Mismo criterio que el documento imprimible (`@/lib/invoicing/document`).
 */
export const INVOICE_TYPE_CODE: Record<PosInvoiceType, string> = {
  completa: "F1",
  ticket: "F2",
};

/** Etiqueta legible del tipo de factura (para `title`/lectores de pantalla). */
export const INVOICE_TYPE_LABEL: Record<PosInvoiceType, string> = {
  completa: "Factura",
  ticket: "Factura simplificada",
};

/**
 * Extrae el NOMBRE del destinatario del jsonb `recipient_data`
 * (`{tax_id, name, address}`). En la factura SIMPLIFICADA (ticket / F2) el
 * receptor es `null` por diseño (y por constraint de la BD). Lee de forma
 * defensiva: cualquier forma inesperada o nombre vacío degrada a `null`.
 */
export function parseRecipientName(value: Json | null | undefined): string | null {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
}

/** Fila de la tabla de FACTURAS (registro `pos_invoices`, solo lectura). */
export interface InvoiceRow {
  id: string;
  fullNumber: string;
  invoiceType: PosInvoiceType;
  /** Fecha de expedición (ISO). Se muestra solo el día. */
  issuedAt: string;
  /** Nombre del destinatario; `null` en factura simplificada (F2). */
  recipientName: string | null;
  taxableBaseCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
}

/** Forma cruda de un registro de factura tal como llega de la consulta. */
export interface RawInvoice {
  id: string;
  full_number: string;
  invoice_type: PosInvoiceType;
  issued_at: string;
  recipient_data: Json | null;
  taxable_base_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
}

/** Normaliza un registro crudo de `pos_invoices` a la fila de la tabla. */
export function toInvoiceRow(raw: RawInvoice): InvoiceRow {
  return {
    id: raw.id,
    fullNumber: raw.full_number,
    invoiceType: raw.invoice_type,
    issuedAt: raw.issued_at,
    recipientName: parseRecipientName(raw.recipient_data),
    taxableBaseCents: raw.taxable_base_cents,
    taxCents: raw.tax_cents,
    totalCents: raw.total_cents,
    currency: raw.currency,
  };
}

/**
 * TOTALES del periodo filtrado del libro de facturas (nº de facturas + sumas). Los
 * calcula la RPC `salon_invoices_totals` sobre EXACTAMENTE el mismo conjunto que la
 * lista, así que cuadran con lo filtrado (aunque la tabla muestre solo las N más
 * recientes). Importes en céntimos: la vista formatea con `formatMoney`.
 */
export interface InvoiceTotals {
  /** Nº de facturas del periodo filtrado (puede superar las filas mostradas). */
  invoiceCount: number;
  taxableBaseCents: number;
  taxCents: number;
  totalCents: number;
}

/** Totales a cero (periodo sin facturas). */
export const EMPTY_INVOICE_TOTALS: InvoiceTotals = {
  invoiceCount: 0,
  taxableBaseCents: 0,
  taxCents: 0,
  totalCents: 0,
};

/** Forma cruda de los totales tal como los devuelve la RPC (`*_cents` bigint→number). */
export interface RawInvoiceTotals {
  invoice_count: number;
  taxable_base_cents: number;
  tax_cents: number;
  total_cents: number;
}

/** Normaliza los totales crudos de la RPC al modelo de la vista. */
export function toInvoiceTotals(raw: RawInvoiceTotals): InvoiceTotals {
  return {
    invoiceCount: raw.invoice_count,
    taxableBaseCents: raw.taxable_base_cents,
    taxCents: raw.tax_cents,
    totalCents: raw.total_cents,
  };
}

// ── TICKETS / VENTAS (pos_sales) ──────────────────────────────────────────────

/** Etiqueta legible del estado de una venta (es-ES). */
export const SALE_STATUS_LABEL: Record<PosSaleStatus, string> = {
  open: "Abierta",
  completed: "Completada",
  voided: "Anulada",
  refunded: "Reembolsada",
};

/** Variante de `Badge` por estado (anulada resalta en rojo; abierta es neutra). */
export const SALE_STATUS_VARIANT: Record<PosSaleStatus, BadgeVariant> = {
  open: "outline",
  completed: "secondary",
  voided: "destructive",
  refunded: "outline",
};

/**
 * Etiqueta legible de cada método de pago base (es-ES).
 *
 * Se mantiene EN PARALELO con `METHOD_LABEL`/`METHOD_ORDER` del arqueo
 * (`arqueo/session-totals`); se duplica aquí a propósito para NO acoplar `@/lib`
 * a un módulo de ruta de la app (la dependencia iría en el sentido equivocado).
 * Ambos derivan del enum `pos_payment_method` del esquema.
 */
export const PAYMENT_METHOD_LABEL: Record<PosPaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  bizum: "Bizum",
  transferencia: "Transferencia",
  otro: "Otro",
};

/** Orden canónico de los métodos para etiquetar el pago de forma estable. */
const PAYMENT_METHOD_ORDER: readonly PosPaymentMethod[] = [
  "efectivo",
  "tarjeta",
  "bizum",
  "transferencia",
  "otro",
];

/** Resumen de los métodos de pago que liquidan una venta. */
export interface PaymentSummary {
  /** Métodos base DISTINTOS usados, en orden canónico. */
  methods: PosPaymentMethod[];
  /** Etiqueta compuesta ("Efectivo + Tarjeta"); `""` si no hay cobros. */
  label: string;
  /** Pago mixto: más de un método base DISTINTO (dos cobros en efectivo no lo es). */
  isMixed: boolean;
}

/**
 * Resume los cobros de una venta (`pos_payments`) por método base: elimina
 * duplicados, los ordena de forma canónica y compone la etiqueta. Un pago
 * repartido en varias filas de `pos_payments` con el MISMO método base no cuenta
 * como mixto; lo que importa es cuántos métodos DISTINTOS intervinieron.
 */
export function summarizePaymentMethods(
  payments: ReadonlyArray<{ method: PosPaymentMethod }>,
): PaymentSummary {
  const present = new Set<PosPaymentMethod>();
  for (const payment of payments) present.add(payment.method);
  const methods = PAYMENT_METHOD_ORDER.filter((method) => present.has(method));
  return {
    methods,
    label: methods.map((method) => PAYMENT_METHOD_LABEL[method]).join(" + "),
    isMixed: methods.length > 1,
  };
}

/** Fila de la tabla de TICKETS / VENTAS (cabecera `pos_sales`, solo lectura). */
export interface SaleRow {
  id: string;
  /** Momento de la venta (ISO). Se muestra fecha y hora. */
  soldAt: string;
  /** Nombre de la sede (vía sesión de caja); `null` si la venta no tiene sede. */
  locationName: string | null;
  /** Profesional que vendió; `null` si no consta. */
  professionalName: string | null;
  /** Cliente asociado; `null` en venta a cliente final sin registrar. */
  customerName: string | null;
  /** Métodos de pago que liquidaron la venta. */
  payment: PaymentSummary;
  totalCents: number;
  currency: string;
  status: PosSaleStatus;
}

/** Relación embebida "a-uno" tal como puede llegar de PostgREST. */
type Embedded<T> = T | T[] | null;

/** Forma cruda de una venta con sus relaciones embebidas. */
export interface RawSale {
  id: string;
  sold_at: string;
  status: PosSaleStatus;
  total_cents: number;
  currency: string;
  professional: Embedded<{ full_name: string }>;
  customer: Embedded<{ full_name: string }>;
  session: Embedded<{ location: Embedded<{ name: string }> }>;
  payments: Array<{ method: PosPaymentMethod }> | null;
}

/**
 * Normaliza una venta cruda (con sus embebidos) a la fila de la tabla. La sede
 * se resuelve por el camino `pos_sales → pos_sessions → locations`; una venta sin
 * sesión (o cuya sesión no tiene sede) queda con `locationName = null`.
 */
export function toSaleRow(raw: RawSale): SaleRow {
  const session = embeddedOne(raw.session);
  const location = session !== null ? embeddedOne(session.location) : null;
  const professional = embeddedOne(raw.professional);
  const customer = embeddedOne(raw.customer);

  return {
    id: raw.id,
    soldAt: raw.sold_at,
    locationName: location?.name ?? null,
    professionalName: professional?.full_name ?? null,
    customerName: customer?.full_name ?? null,
    payment: summarizePaymentMethods(raw.payments ?? []),
    totalCents: raw.total_cents,
    currency: raw.currency,
    status: raw.status,
  };
}
