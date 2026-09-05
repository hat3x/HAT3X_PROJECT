/**
 * Consultas de LECTURA de las tablas de facturación (Server Components).
 *
 * Scopeadas por `salon_id` (defensa en profundidad sobre la RLS: un miembro solo
 * ve su salón) y apoyadas en los índices del esquema para el listado:
 *   · facturas → `(salon_id, issued_at desc)`  (libro registro)
 *   · ventas   → `(salon_id, sold_at desc)`
 *
 * Se piden solo las columnas que pinta la tabla y se acotan a las
 * {@link FACTURACION_LIST_LIMIT} más recientes (el LIBRO COMPLETO de facturas se
 * descarga con «Exportar libro» → `GET /api/facturacion/export`). Datos de SOLO
 * LECTURA: aquí no se escribe nada.
 */
import type { InvoiceFilters } from "@/lib/facturacion/filters";
import {
  EMPTY_INVOICE_TOTALS,
  toInvoiceRow,
  toInvoiceTotals,
  toSaleRow,
  type InvoiceRow,
  type InvoiceTotals,
  type RawInvoice,
  type RawInvoiceTotals,
  type RawSale,
  type SaleRow,
} from "@/lib/facturacion/rows";
import { toSaleDetail, type RawSaleDetail, type SaleDetail } from "@/lib/facturacion/sale-ticket";
import { createClient } from "@/lib/supabase/server";

/**
 * Tope de filas del listado. Mantiene la consulta barata y la tabla legible; el
 * histórico completo de facturas se obtiene por el export del libro registro.
 */
export const FACTURACION_LIST_LIMIT = 100;

/**
 * Traduce los filtros de la vista a los argumentos de las RPC de facturación.
 * `null` en un campo = ese filtro no se aplica (la RPC lo trata como «sin filtro»).
 * Se comparte entre lista y totales para que AMBOS consulten exactamente lo mismo.
 */
function toInvoiceRpcArgs(salonId: string, filters: InvoiceFilters) {
  return {
    p_salon_id: salonId,
    p_from: filters.from,
    p_to: filters.to,
    p_location_id: filters.locationId,
    p_invoice_type: filters.invoiceType,
    p_payment_method: filters.paymentMethod,
    p_search: filters.search,
  };
}

/**
 * Facturas del salón, de la más reciente a la más antigua. Orden por fecha de
 * expedición y, a igualdad, por número correlativo (ambos descendentes) para un
 * orden estable cuando varias comparten día.
 */
export async function fetchRecentInvoices(salonId: string): Promise<InvoiceRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_invoices")
    .select(
      "id, full_number, invoice_type, issued_at, recipient_data, taxable_base_cents, tax_cents, total_cents, currency",
    )
    .eq("salon_id", salonId)
    .order("issued_at", { ascending: false })
    .order("sequential_number", { ascending: false })
    .limit(FACTURACION_LIST_LIMIT);

  if (error !== null) {
    throw new Error(`No se pudieron cargar las facturas: ${error.message}`);
  }

  return (data ?? []).map((row) => toInvoiceRow(row as RawInvoice));
}

/**
 * Facturas del salón FILTRADAS en servidor (rango de fechas, sede, tipo F1/F2,
 * método de pago y búsqueda por número/cliente) vía la RPC `salon_invoices_filtered`.
 * La RPC resuelve los filtros que cruzan tablas (sede por sesión, método por cobros)
 * sin traer datos crudos al cliente, ordena por fecha/nº correlativo desc y acota a
 * `limit` (por defecto {@link FACTURACION_LIST_LIMIT}).
 */
export async function fetchFilteredInvoices(
  salonId: string,
  filters: InvoiceFilters,
  limit: number = FACTURACION_LIST_LIMIT,
): Promise<InvoiceRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("salon_invoices_filtered", {
    ...toInvoiceRpcArgs(salonId, filters),
    p_limit: limit,
  });

  if (error !== null) {
    throw new Error(`No se pudieron cargar las facturas: ${error.message}`);
  }

  return (data ?? []).map((row) => toInvoiceRow(row as RawInvoice));
}

/**
 * TOTALES del periodo filtrado (nº de facturas + Σ base imponible, IVA y total) vía
 * la RPC `salon_invoices_totals`. Agrega sobre EXACTAMENTE el mismo conjunto que
 * {@link fetchFilteredInvoices} (mismos filtros, sin el `limit`): por eso los totales
 * cuadran con lo filtrado aunque la tabla muestre solo las N más recientes.
 */
export async function fetchInvoiceTotals(
  salonId: string,
  filters: InvoiceFilters,
): Promise<InvoiceTotals> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "salon_invoices_totals",
    toInvoiceRpcArgs(salonId, filters),
  );

  if (error !== null) {
    throw new Error(`No se pudieron calcular los totales: ${error.message}`);
  }

  const row = data?.[0];
  return row !== undefined
    ? toInvoiceTotals(row as RawInvoiceTotals)
    : EMPTY_INVOICE_TOTALS;
}

/**
 * Ventas (tickets) del salón, de la más reciente a la más antigua, con la sede
 * (vía sesión de caja), el profesional, el cliente y los métodos de pago
 * embebidos en una sola consulta (sin N+1). La sede se obtiene por el camino
 * `pos_sales → pos_sessions → locations`.
 */
export async function fetchRecentSales(salonId: string): Promise<SaleRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      "id, sold_at, status, total_cents, currency, professional:professionals(full_name), customer:customers(full_name), session:pos_sessions(location:locations(name)), payments:pos_payments(method)",
    )
    .eq("salon_id", salonId)
    .order("sold_at", { ascending: false })
    .limit(FACTURACION_LIST_LIMIT);

  if (error !== null) {
    throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
  }

  return (data ?? []).map((row) => toSaleRow(row as unknown as RawSale));
}

/**
 * Detalle de UNA venta (cabecera + LÍNEAS + COBROS) para su página de detalle y su
 * reimpresión. Trae en una sola consulta las líneas (`pos_sale_lines`), los cobros
 * (`pos_payments`) y los embebidos de sede/profesional/cliente, todo scopeado por
 * `salon_id` (defensa en profundidad sobre la RLS). Devuelve `null` si la venta no
 * existe o no pertenece al salón (para responder 404 sin filtrar existencia).
 *
 * El orden de líneas y cobros lo fija el normalizador PURO (`toSaleDetail`), de
 * modo que el resultado es determinista con independencia del orden del motor.
 */
export async function fetchSaleDetail(
  salonId: string,
  saleId: string,
): Promise<SaleDetail | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      "id, sold_at, status, currency, subtotal_cents, discount_cents, tax_cents, total_cents, notes, professional:professionals(full_name), customer:customers(full_name), session:pos_sessions(location:locations(name)), lines:pos_sale_lines(description, quantity, unit_price_cents, vat_rate, line_total_cents, created_at), payments:pos_payments(method, amount_cents, paid_at)",
    )
    .eq("salon_id", salonId)
    .eq("id", saleId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`No se pudo cargar la venta: ${error.message}`);
  }
  if (data === null) {
    return null;
  }

  return toSaleDetail(data as unknown as RawSaleDetail);
}
