/**
 * Punto de entrada público del motor de facturación (`@/lib/invoicing`).
 *
 * Reúne el motor puro de construcción del registro, el orquestador de emisión,
 * la exportación del libro de facturas y el documento imprimible. Los consumidores
 * (Server Actions del TPV, libro de facturas) importan SIEMPRE desde aquí.
 *
 * Nota: `emit.ts` es server-only (persiste con un cliente Supabase de servidor).
 * No lo importes desde componentes de cliente.
 */

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

// ── Exportación del libro de facturas (gestoría) — puro, sin I/O ──────────────
export {
  EXPORT_FORMATS,
  buildInvoicesCsv,
  buildInvoicesJson,
  toExportRecord,
  invoiceTypeLabel,
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

// ── Documento imprimible (ticket y factura completa) ──────────────────────────
export {
  buildInvoiceDocumentHtml,
  type InvoiceDocumentData,
  type InvoiceDocumentOptions,
  type DocumentIssuer,
  type DocumentRecipient,
  type DocumentTaxRow,
  type DocumentLineItem,
} from "./document";
