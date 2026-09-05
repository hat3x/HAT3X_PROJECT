import { NextResponse, type NextRequest } from "next/server";

import {
  buildInvoiceDocumentHtml,
  type DocumentLineItem,
  type DocumentTaxRow,
  type InvoiceDocumentData,
} from "@/lib/invoicing";
import { getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

/**
 * Documento imprimible (HTML/PDF) de una factura.
 *
 * `GET /api/facturacion/documento/[id]` devuelve la página HTML autónoma del
 * registro `pos_invoices` indicado, aislada por `salon_id` del usuario. Sirve
 * tanto para el ticket (factura simplificada) como para la factura completa; el
 * navegador la imprime o la guarda como PDF (Ctrl+P).
 *
 * No cachear: el documento depende del salón/sesión y del registro.
 */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

/** Respuesta HTML mínima para errores (mismo Content-Type que el documento). */
function htmlError(message: string, status: number): NextResponse {
  const body = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Factura</title></head><body style="font-family:system-ui;padding:2rem;color:#0f172a"><p>${message}</p></body></html>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Lee de forma defensiva `{tax_id, legal_name, fiscal_address}` del emisor. */
function parseIssuer(value: unknown): InvoiceDocumentData["issuer"] {
  const obj = (value ?? {}) as Record<string, unknown>;
  return {
    taxId: typeof obj.tax_id === "string" ? obj.tax_id : "",
    legalName: typeof obj.legal_name === "string" ? obj.legal_name : "",
    fiscalAddress: typeof obj.fiscal_address === "string" ? obj.fiscal_address : null,
  };
}

/** Lee de forma defensiva `{tax_id, name, address}` del receptor (o `null`). */
function parseRecipient(value: unknown): InvoiceDocumentData["recipient"] {
  if (value === null || value === undefined) return null;
  const obj = value as Record<string, unknown>;
  return {
    taxId: typeof obj.tax_id === "string" ? obj.tax_id : "",
    name: typeof obj.name === "string" ? obj.name : "",
    address: typeof obj.address === "string" ? obj.address : null,
  };
}

/** Normaliza el jsonb `tax_breakdown` a filas tipadas del documento. */
function parseTaxBreakdown(value: unknown): DocumentTaxRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      vat_rate: Number(row.vat_rate ?? 0),
      base_cents: Number(row.base_cents ?? 0),
      cuota_cents: Number(row.cuota_cents ?? 0),
      total_cents: Number(row.total_cents ?? 0),
    };
  });
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return htmlError("No tienes un salón asignado o la sesión ha caducado.", 403);
  }

  const supabase = createClient();

  const { data: invoice, error } = await supabase
    .from("pos_invoices")
    .select(
      "id, sale_id, invoice_type, series, sequential_number, full_number, issued_at, currency, tax_breakdown, taxable_base_cents, tax_cents, total_cents, issuer_data, recipient_data",
    )
    .eq("id", params.id)
    .eq("salon_id", salon.id)
    .maybeSingle();

  if (error !== null) {
    return htmlError(`No se pudo cargar la factura: ${error.message}`, 500);
  }
  if (invoice === null) {
    return htmlError("La factura no existe o no es accesible.", 404);
  }

  // Detalle de líneas: mejor esfuerzo. Solo si la factura procede de una venta.
  let lines: DocumentLineItem[] | undefined;
  if (invoice.sale_id !== null) {
    const { data: saleLines } = await supabase
      .from("pos_sale_lines")
      .select("description, quantity, unit_price_cents, vat_rate, line_total_cents")
      .eq("sale_id", invoice.sale_id)
      .eq("salon_id", salon.id)
      .order("created_at", { ascending: true });
    if (saleLines !== null && saleLines.length > 0) {
      lines = saleLines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
        vatRate: line.vat_rate,
        lineTotalCents: line.line_total_cents,
      }));
    }
  }

  const data: InvoiceDocumentData = {
    invoiceType: invoice.invoice_type,
    series: invoice.series,
    sequentialNumber: invoice.sequential_number,
    fullNumber: invoice.full_number,
    issuedAt: new Date(invoice.issued_at),
    currency: invoice.currency,
    issuer: parseIssuer(invoice.issuer_data),
    recipient: parseRecipient(invoice.recipient_data),
    taxBreakdown: parseTaxBreakdown(invoice.tax_breakdown),
    taxableBaseCents: invoice.taxable_base_cents,
    taxCents: invoice.tax_cents,
    totalCents: invoice.total_cents,
    lines,
  };

  const html = buildInvoiceDocumentHtml(data, {
    timezone: salon.timezone,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="factura-${invoice.full_number}.html"`,
      "Cache-Control": "no-store",
    },
  });
}
