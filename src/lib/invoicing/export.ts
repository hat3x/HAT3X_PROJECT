/**
 * Exportación del libro registro de facturas expedidas (`@/lib/invoicing`).
 *
 * Toma los registros inmutables de `pos_invoices` y los serializa en un formato
 * estructurado y descargable para la **AEAT / gestoría** (libro registro de
 * facturas expedidas), filtrable por **serie** y **periodo**.
 *
 * Módulo PURO (sin I/O ni Supabase): recibe las filas ya leídas y devuelve el
 * texto. Así es testeable sin BD y reutilizable. El Route Handler
 * (`app/api/facturacion/export/route.ts`) resuelve auth + aislamiento por
 * `salon_id` y le pasa las filas.
 *
 * ── Formato CSV (por defecto) ────────────────────────────────────────────────
 * Una **fila por línea de desglose de IVA** (`invoice × tipo impositivo`): es el
 * formato de "libro registro" que esperan las gestorías, sin pérdida de datos
 * cuando una factura mezcla varios tipos de IVA. Los campos de cabecera de la
 * factura se repiten en cada línea. Separador `;` y decimales con coma (`10,00`)
 * — convención de Excel en español — y BOM UTF-8 para que Excel respete acentos.
 *
 * ── Formato JSON ─────────────────────────────────────────────────────────────
 * Registros completos con el desglose anidado y la cadena de huellas: lossless
 * y legible por máquina (integraciones con software de la gestoría).
 */
import type { PosInvoiceType } from "@/types/database";

import type { TaxBreakdownRow } from "./engine";

/** Formatos de exportación admitidos. */
export const EXPORT_FORMATS = ["csv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Fila de `pos_invoices` necesaria para exportar. Subconjunto tipado de
 * `PosInvoice`: el Route Handler selecciona exactamente estas columnas.
 */
export interface ExportableInvoice {
  full_number: string;
  series: string;
  sequential_number: number;
  invoice_type: PosInvoiceType;
  issued_at: string;
  currency: string;
  tax_breakdown: unknown;
  taxable_base_cents: number;
  tax_cents: number;
  total_cents: number;
  issuer_data: unknown;
  recipient_data: unknown;
  hash_algorithm: string;
  current_hash: string;
  previous_hash: string | null;
}

/** Filtros de la exportación (ya validados/normalizados). */
export interface ExportFilters {
  /** Serie concreta a exportar; `null` = todas las series del salón. */
  series: string | null;
  /** Fecha de expedición desde (inclusive, `YYYY-MM-DD`); `null` = sin límite. */
  from: string | null;
  /** Fecha de expedición hasta (inclusive, `YYYY-MM-DD`); `null` = sin límite. */
  to: string | null;
  format: ExportFormat;
}

/** Snapshot fiscal del emisor tal como se guardó en la factura. */
interface IssuerSnapshot {
  taxId: string;
  legalName: string;
  fiscalAddress: string | null;
}

/** Snapshot fiscal del receptor (solo facturas completas / F1). */
interface RecipientSnapshot {
  taxId: string;
  name: string;
  address: string | null;
}

/**
 * Traduce el tipo interno al código de factura AEAT.
 *   · `ticket`   → **F2** (factura simplificada, sin receptor).
 *   · `completa` → **F1** (factura ordinaria, con receptor).
 */
export function mapInvoiceTypeToAeat(type: PosInvoiceType): "F1" | "F2" {
  return type === "completa" ? "F1" : "F2";
}

/** Formatea céntimos como importe con coma decimal, sin separador de miles. */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}${euros},${rest}`;
}

/**
 * Interpreta `tax_breakdown` (jsonb) como filas tipadas de desglose de IVA,
 * de forma defensiva (los datos vienen de BD como `unknown`).
 */
export function parseTaxBreakdown(value: unknown): TaxBreakdownRow[] {
  if (!Array.isArray(value)) return [];
  const rows: TaxBreakdownRow[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    rows.push({
      vat_rate: toNumber(row.vat_rate),
      base_cents: toNumber(row.base_cents),
      cuota_cents: toNumber(row.cuota_cents),
      total_cents: toNumber(row.total_cents),
    });
  }
  return rows;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseIssuer(value: unknown): IssuerSnapshot {
  const o = (value ?? {}) as Record<string, unknown>;
  return {
    taxId: toStringOrEmpty(o.tax_id ?? o.taxId),
    legalName: toStringOrEmpty(o.legal_name ?? o.legalName),
    fiscalAddress: toStringOrNull(o.fiscal_address ?? o.fiscalAddress),
  };
}

function parseRecipient(value: unknown): RecipientSnapshot | null {
  if (value === null || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  return {
    taxId: toStringOrEmpty(o.tax_id ?? o.taxId),
    name: toStringOrEmpty(o.name),
    address: toStringOrNull(o.address),
  };
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Fecha de expedición como `YYYY-MM-DD` (recorta la parte horaria si la trae). */
function issuedDate(issuedAt: string): string {
  return issuedAt.slice(0, 10);
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** BOM UTF-8: hace que Excel (es-ES) abra el CSV con acentos correctos. */
const UTF8_BOM = "﻿";

/** Separador de campos: `;` (Excel en configuración regional española). */
const CSV_SEPARATOR = ";";

const CSV_HEADERS: readonly string[] = [
  "Numero",
  "Serie",
  "Numero correlativo",
  "Tipo AEAT",
  "Fecha expedicion",
  "NIF emisor",
  "Razon social emisor",
  "NIF receptor",
  "Nombre receptor",
  "Tipo IVA (%)",
  "Base imponible",
  "Cuota IVA",
  "Total linea",
  "Base total factura",
  "Cuota total factura",
  "Total factura",
  "Moneda",
  "Algoritmo huella",
  "Huella",
  "Huella anterior",
];

/** Escapa un campo CSV: entrecomilla si contiene separador, comillas o saltos. */
function csvField(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  if (/[";\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(fields: (string | number | null)[]): string {
  return fields.map(csvField).join(CSV_SEPARATOR);
}

const FALLBACK_BREAKDOWN: TaxBreakdownRow = {
  vat_rate: 0,
  base_cents: 0,
  cuota_cents: 0,
  total_cents: 0,
};

/**
 * Serializa las facturas a CSV (libro registro de facturas expedidas).
 *
 * Emite **una fila por línea de desglose de IVA**. Una factura sin desglose
 * (caso degenerado) se emite igualmente con una fila de importes a cero, para
 * no perder el registro de la cadena.
 */
export function buildInvoicesCsv(invoices: readonly ExportableInvoice[]): string {
  const lines: string[] = [csvRow([...CSV_HEADERS])];

  for (const invoice of invoices) {
    const issuer = parseIssuer(invoice.issuer_data);
    const recipient = parseRecipient(invoice.recipient_data);
    const breakdown = parseTaxBreakdown(invoice.tax_breakdown);
    const rows = breakdown.length > 0 ? breakdown : [FALLBACK_BREAKDOWN];

    for (const row of rows) {
      lines.push(
        csvRow([
          invoice.full_number,
          invoice.series,
          invoice.sequential_number,
          mapInvoiceTypeToAeat(invoice.invoice_type),
          issuedDate(invoice.issued_at),
          issuer.taxId,
          issuer.legalName,
          recipient?.taxId ?? "",
          recipient?.name ?? "",
          row.vat_rate,
          centsToAmount(row.base_cents),
          centsToAmount(row.cuota_cents),
          centsToAmount(row.total_cents),
          centsToAmount(invoice.taxable_base_cents),
          centsToAmount(invoice.tax_cents),
          centsToAmount(invoice.total_cents),
          invoice.currency,
          invoice.hash_algorithm,
          invoice.current_hash,
          invoice.previous_hash,
        ]),
      );
    }
  }

  // CRLF: máxima compatibilidad con Excel al abrir el CSV directamente.
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}

// ── JSON ────────────────────────────────────────────────────────────────────

/** Un registro en la exportación JSON (estructurado, lossless). */
export interface InvoiceExportRecord {
  fullNumber: string;
  series: string;
  sequentialNumber: number;
  invoiceType: PosInvoiceType;
  aeatType: "F1" | "F2";
  issuedAt: string;
  currency: string;
  issuer: IssuerSnapshot;
  recipient: RecipientSnapshot | null;
  taxBreakdown: TaxBreakdownRow[];
  taxableBaseCents: number;
  taxCents: number;
  totalCents: number;
  hashAlgorithm: string;
  currentHash: string;
  previousHash: string | null;
}

/** Documento JSON completo de la exportación (con metadatos de filtro). */
export interface InvoiceExportDocument {
  generatedAt: string;
  filters: ExportFilters;
  count: number;
  invoices: InvoiceExportRecord[];
}

/** Transforma una fila de BD en el registro estructurado de exportación. */
export function toExportRecord(invoice: ExportableInvoice): InvoiceExportRecord {
  return {
    fullNumber: invoice.full_number,
    series: invoice.series,
    sequentialNumber: invoice.sequential_number,
    invoiceType: invoice.invoice_type,
    aeatType: mapInvoiceTypeToAeat(invoice.invoice_type),
    issuedAt: invoice.issued_at,
    currency: invoice.currency,
    issuer: parseIssuer(invoice.issuer_data),
    recipient: parseRecipient(invoice.recipient_data),
    taxBreakdown: parseTaxBreakdown(invoice.tax_breakdown),
    taxableBaseCents: invoice.taxable_base_cents,
    taxCents: invoice.tax_cents,
    totalCents: invoice.total_cents,
    hashAlgorithm: invoice.hash_algorithm,
    currentHash: invoice.current_hash,
    previousHash: invoice.previous_hash,
  };
}

/** Serializa el documento JSON de exportación. */
export function buildInvoicesJson(
  invoices: readonly ExportableInvoice[],
  filters: ExportFilters,
  generatedAt: string,
): string {
  const document: InvoiceExportDocument = {
    generatedAt,
    filters,
    count: invoices.length,
    invoices: invoices.map(toExportRecord),
  };
  return JSON.stringify(document, null, 2);
}

// ── Nombre de archivo ──────────────────────────────────────────────────────────

/**
 * Nombre de archivo descriptivo: incluye serie y periodo cuando se filtran.
 * Ej.: `facturas_serie-A_2026-01-01_2026-03-31.csv`.
 */
export function exportFilename(filters: ExportFilters): string {
  const parts = ["facturas"];
  if (filters.series !== null) {
    parts.push(`serie-${filters.series.replace(/[^A-Za-z0-9-]/g, "_")}`);
  }
  if (filters.from !== null) parts.push(filters.from);
  if (filters.to !== null) parts.push(filters.to);
  return `${parts.join("_")}.${filters.format}`;
}

/** `content-type` correspondiente al formato (con charset para el CSV). */
export function exportContentType(format: ExportFormat): string {
  return format === "json"
    ? "application/json; charset=utf-8"
    : "text/csv; charset=utf-8";
}
