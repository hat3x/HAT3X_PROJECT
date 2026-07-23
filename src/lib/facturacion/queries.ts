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
import {
  toInvoiceRow,
  toSaleRow,
  type InvoiceRow,
  type RawInvoice,
  type RawSale,
  type SaleRow,
} from "@/lib/facturacion/rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Tope de filas del listado. Mantiene la consulta barata y la tabla legible; el
 * histórico completo de facturas se obtiene por el export del libro registro.
 */
export const FACTURACION_LIST_LIMIT = 100;

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
