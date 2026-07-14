/**
 * Punto de entrada público del motor de facturación Veri*factu (`@/lib/invoicing`).
 *
 * Reúne el cálculo de la huella encadenada, el motor puro de construcción del
 * registro y el orquestador de emisión. Los consumidores (Server Actions del
 * TPV, verificación del libro de facturas) importan SIEMPRE desde aquí.
 *
 * Nota: `emit.ts` es server-only (persiste con un cliente Supabase de servidor).
 * No lo importes desde componentes de cliente.
 */

// ── Huella y encadenamiento SHA-256 (puro, reutilizable en verificación) ──────
export {
  buildCanonicalString,
  computeInvoiceHash,
  verifyHashChain,
  type HashableInvoiceRecord,
  type VerifactuInvoiceCode,
} from "./hash";

// ── Motor puro: construcción del registro + desglose de IVA ───────────────────
export {
  buildInvoiceRecord,
  toTaxBreakdownRows,
  InvoiceEmissionError,
  type BuildInvoiceRecordInput,
  type BuiltInvoiceRecord,
  type IssuerData,
  type RecipientData,
  type TaxBreakdownRow,
} from "./engine";

// ── Orquestador de emisión (server-only) ──────────────────────────────────────
export {
  emitInvoice,
  type EmitInvoiceParams,
  type EmittedInvoice,
} from "./emit";

// ── Exportación del libro registro (AEAT / gestoría) — puro, sin I/O ──────────
export {
  EXPORT_FORMATS,
  buildInvoicesCsv,
  buildInvoicesJson,
  toExportRecord,
  mapInvoiceTypeToAeat,
  centsToAmount,
  parseTaxBreakdown,
  exportFilename,
  exportContentType,
  type ExportFormat,
  type ExportableInvoice,
  type ExportFilters,
  type InvoiceExportRecord,
  type InvoiceExportDocument,
} from "./export";
