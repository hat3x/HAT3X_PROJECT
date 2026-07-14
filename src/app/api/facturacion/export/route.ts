/**
 * GET /api/facturacion/export — Exportación del libro registro de facturas
 * expedidas para la AEAT / gestoría.
 *
 * Devuelve un archivo descargable (CSV por defecto, o JSON) con los registros
 * inmutables de `pos_invoices` del salón activo, filtrable por **serie** y
 * **periodo** de expedición.
 *
 * ── Aislamiento multi-tenant ─────────────────────────────────────────────────
 * Doble barrera:
 *   1. RLS: el cliente Supabase de servidor va scopeado por la sesión, así que
 *      solo ve facturas de los salones del usuario.
 *   2. `.eq("salon_id", …)` explícito con el salón activo resuelto en servidor:
 *      nunca se acepta un `salon_id` del cliente.
 * Además la exportación fiscal se restringe a roles de administración
 * (`owner`/`manager`); `staff` no puede descargar el libro registro.
 *
 * Parámetros (query string), todos opcionales:
 *   · `series` — serie concreta; ausente = todas.
 *   · `from`   — fecha de expedición desde (YYYY-MM-DD, inclusive).
 *   · `to`     — fecha de expedición hasta (YYYY-MM-DD, inclusive).
 *   · `format` — `csv` (por defecto) | `json`.
 */
import { NextResponse } from "next/server";

import {
  buildInvoicesCsv,
  buildInvoicesJson,
  exportContentType,
  exportFilename,
  type ExportableInvoice,
  type ExportFilters,
} from "@/lib/invoicing";
import { canManageSettings, getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { invoiceExportQuerySchema } from "@/lib/validations/invoice";

export const dynamic = "force-dynamic";

/** Columnas de `pos_invoices` que necesita el serializador de exportación. */
const EXPORT_COLUMNS =
  "full_number, series, sequential_number, invoice_type, issued_at, currency, tax_breakdown, taxable_base_cents, tax_cents, total_cents, issuer_data, recipient_data, hash_algorithm, current_hash, previous_hash";

export async function GET(request: Request): Promise<Response> {
  // 1. Autenticación + pertenencia a un salón.
  const membership = await getActiveMembership();
  if (membership === null) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Autorización: la exportación fiscal es de administración.
  if (!canManageSettings(membership.role)) {
    return NextResponse.json(
      { error: "Necesitas rol de administración para exportar la facturación" },
      { status: 403 },
    );
  }

  // 3. Validación de los parámetros de filtro.
  const url = new URL(request.url);
  const parsed = invoiceExportQuerySchema.safeParse({
    series: url.searchParams.get("series") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros no válidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const filters: ExportFilters = {
    series: parsed.data.series ?? null,
    from: parsed.data.from ?? null,
    to: parsed.data.to ?? null,
    format: parsed.data.format,
  };

  // 4. Lectura scopeada por salón (RLS + filtro explícito) y por filtros.
  const supabase = createClient();
  let query = supabase
    .from("pos_invoices")
    .select(EXPORT_COLUMNS)
    .eq("salon_id", membership.salonId)
    .order("series", { ascending: true })
    .order("sequential_number", { ascending: true });

  if (filters.series !== null) {
    query = query.eq("series", filters.series);
  }
  if (filters.from !== null) {
    query = query.gte("issued_at", filters.from);
  }
  if (filters.to !== null) {
    // `to` inclusive: hasta el final del día indicado.
    query = query.lte("issued_at", `${filters.to}T23:59:59.999`);
  }

  const { data, error } = await query;

  if (error !== null) {
    console.error("[facturacion/export] query error", error.message);
    return NextResponse.json(
      { error: "No se pudo leer el libro de facturas" },
      { status: 500 },
    );
  }

  const invoices = (data ?? []) as unknown as ExportableInvoice[];

  // 5. Serialización al formato solicitado.
  const body =
    filters.format === "json"
      ? buildInvoicesJson(invoices, filters, new Date().toISOString())
      : buildInvoicesCsv(invoices);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": exportContentType(filters.format),
      "content-disposition": `attachment; filename="${exportFilename(filters)}"`,
      "cache-control": "no-store",
    },
  });
}
