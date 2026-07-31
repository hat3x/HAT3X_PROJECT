/**
 * Motor puro de construcción del registro de facturación.
 *
 * A partir de los totales de una venta (calculados por `@/lib/payments`, la
 * fuente única de aritmética de IVA) y los datos de emisor/receptor, produce
 * la fila lista para insertar en `pos_invoices`: desglose de IVA, agregados y
 * snapshots fiscales.
 *
 * Es una función PURA y sin dependencias de I/O: no lee la base de datos ni
 * genera fechas por su cuenta (el número secuencial y la fecha de expedición se
 * le pasan desde fuera). Así se puede testear el desglose de forma determinista,
 * y el orquestador (`emit.ts`, server-only) se limita a resolver la numeración
 * y persistir.
 */
import type { SaleTotals } from "@/lib/payments";
import type { Json, PosInvoiceType, TablesInsert } from "@/types/database";

/** Snapshot del emisor (salón) al expedir. Persistido en `issuer_data`. */
export interface IssuerData {
  /** NIF/CIF del emisor. */
  taxId: string;
  /** Razón social del emisor. */
  legalName: string;
  /** Domicilio fiscal del emisor. */
  fiscalAddress: string | null;
}

/** Datos fiscales del receptor. Obligatorio en 'completa'; ausente en 'ticket'. */
export interface RecipientData {
  /** NIF/CIF del cliente. */
  taxId: string;
  /** Nombre o razón social del cliente. */
  name: string;
  /** Dirección postal/fiscal del cliente. */
  address: string | null;
}

/** Una fila del desglose de IVA en la forma jsonb que almacena `tax_breakdown`. */
export interface TaxBreakdownRow {
  /** Tipo de IVA en porcentaje (21, 10, 4, 0…). */
  vat_rate: number;
  /** Base imponible a ese tipo, en céntimos. */
  base_cents: number;
  /** Cuota de IVA a ese tipo, en céntimos. */
  cuota_cents: number;
  /** Bruto a ese tipo (base + cuota), en céntimos. */
  total_cents: number;
}

/** Entrada para construir un registro de facturación (ya resuelta la numeración). */
export interface BuildInvoiceRecordInput {
  salonId: string;
  /** Venta de origen (trazabilidad TPV→factura); `null` en factura libre. */
  saleId: string | null;
  invoiceType: PosInvoiceType;
  series: string;
  /** Número secuencial dentro de la serie, ya resuelto (correlativo, sin huecos). */
  sequentialNumber: number;
  /** Fecha de expedición de la factura. */
  issuedAt: Date;
  /** Totales e IVA de la venta (de `computeSaleTotals`). */
  totals: SaleTotals;
  /** Snapshot del emisor. */
  issuer: IssuerData;
  /** Datos del receptor; `null` en 'ticket'. Obligatorio en 'completa'. */
  recipient: RecipientData | null;
  /** Moneda ISO-4217. Por defecto EUR. */
  currency?: string;
}

/** Registro construido: fila lista para `insert` + número visible. */
export interface BuiltInvoiceRecord {
  /** Fila lista para `supabase.from('pos_invoices').insert(...)`. */
  insert: TablesInsert<"pos_invoices">;
  /** Número visible (serie-número), útil para la respuesta al TPV. */
  fullNumber: string;
}

/** Se lanza cuando faltan datos obligatorios para expedir el registro. */
export class InvoiceEmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceEmissionError";
  }
}

/**
 * Traduce el desglose de IVA de la capa de pagos (`VatBreakdownEntry`) a la forma
 * jsonb de `tax_breakdown` (`{vat_rate, base_cents, cuota_cents, total_cents}`).
 */
export function toTaxBreakdownRows(totals: SaleTotals): TaxBreakdownRow[] {
  return totals.vatBreakdown.map((entry) => ({
    vat_rate: entry.vatRate,
    base_cents: entry.baseCents,
    cuota_cents: entry.taxCents,
    total_cents: entry.grossCents,
  }));
}

/**
 * Construye el registro de facturación.
 *
 * Reglas de dominio verificadas:
 *  · el emisor debe estar identificado (NIF/razón social);
 *  · 'completa' exige receptor con NIF y nombre (constraint de BD equivalente);
 *  · el total debe ser positivo y cuadrar (`base + cuota = total`, lo garantiza
 *    la capa de pagos por construcción).
 */
export function buildInvoiceRecord(input: BuildInvoiceRecordInput): BuiltInvoiceRecord {
  const { issuer, recipient, invoiceType, totals } = input;

  if (issuer.taxId.trim() === "" || issuer.legalName.trim() === "") {
    throw new InvoiceEmissionError(
      "Faltan los datos fiscales del salón (NIF y razón social) para emitir la factura. Complétalos en Ajustes › Fiscal.",
    );
  }
  if (invoiceType === "completa") {
    if (recipient === null || recipient.taxId.trim() === "" || recipient.name.trim() === "") {
      throw new InvoiceEmissionError(
        "Una factura completa requiere el NIF y el nombre del cliente.",
      );
    }
  }
  if (input.sequentialNumber <= 0 || !Number.isInteger(input.sequentialNumber)) {
    throw new InvoiceEmissionError(
      `Número secuencial no válido: ${input.sequentialNumber}`,
    );
  }
  if (totals.totalCents <= 0) {
    throw new InvoiceEmissionError("El total de la factura debe ser mayor que 0.");
  }

  const fullNumber = `${input.series}-${input.sequentialNumber}`;

  // El receptor solo se persiste en 'completa': el ticket es anónimo.
  const recipientData =
    invoiceType === "completa" && recipient !== null
      ? { tax_id: recipient.taxId, name: recipient.name, address: recipient.address }
      : null;

  const insert: TablesInsert<"pos_invoices"> = {
    salon_id: input.salonId,
    sale_id: input.saleId,
    invoice_type: invoiceType,
    series: input.series,
    sequential_number: input.sequentialNumber,
    issued_at: input.issuedAt.toISOString(),
    currency: input.currency ?? "EUR",
    // El desglose es un array de objetos planos con claves fijas; se serializa
    // tal cual a la columna jsonb `tax_breakdown` (los tipos generados esperan `Json`).
    tax_breakdown: toTaxBreakdownRows(totals) as unknown as Json,
    taxable_base_cents: totals.subtotalCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    issuer_data: {
      tax_id: issuer.taxId,
      legal_name: issuer.legalName,
      fiscal_address: issuer.fiscalAddress,
    },
    recipient_data: recipientData,
  };

  return { insert, fullNumber };
}
