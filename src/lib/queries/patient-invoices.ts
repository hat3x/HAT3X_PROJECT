import { createClient } from "@/lib/supabase/client";

/**
 * Factura o ticket generado en Kairos (TPV) para un paciente. Se deriva de
 * pos_sales (la venta) + su pos_invoices asociada (si se emitió factura formal).
 * `docUrl` apunta al documento imprimible/descargable:
 *   - factura formal → /api/facturacion/documento/{invoiceId}
 *   - ticket simple  → /api/facturacion/ticket/{saleId}
 */
export type PatientInvoiceRow = {
  key: string;
  kind: "invoice" | "ticket";
  fullNumber: string | null;
  totalCents: number;
  dateIso: string;
  docUrl: string;
};

export const patientInvoiceKeys = {
  all: (salonId: string) => ["patient-invoices", salonId] as const,
  patient: (salonId: string, customerId: string) =>
    [...patientInvoiceKeys.all(salonId), customerId] as const,
};

type RawSale = {
  id: string;
  total_cents: number;
  sold_at: string;
  pos_invoices:
    | { id: string; full_number: string | null; issued_at: string; total_cents: number }[]
    | null;
};

/**
 * Devuelve las ventas de Kairos (TPV) de un paciente —cada una como factura
 * formal si la tiene, o como ticket si no—, de la más reciente a la más antigua.
 */
export async function fetchPatientInvoices(
  salonId: string,
  customerId: string,
): Promise<PatientInvoiceRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      "id, total_cents, sold_at, pos_invoices(id, full_number, issued_at, total_cents)",
    )
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("sold_at", { ascending: false })
    .returns<RawSale[]>();

  if (error !== null) {
    throw new Error(error.message);
  }

  return (data ?? []).map((sale) => {
    const invoice = Array.isArray(sale.pos_invoices) ? sale.pos_invoices[0] : null;
    if (invoice) {
      return {
        key: invoice.id,
        kind: "invoice" as const,
        fullNumber: invoice.full_number,
        totalCents: invoice.total_cents,
        dateIso: invoice.issued_at,
        docUrl: `/api/facturacion/documento/${invoice.id}`,
      };
    }
    return {
      key: sale.id,
      kind: "ticket" as const,
      fullNumber: null,
      totalCents: sale.total_cents,
      dateIso: sale.sold_at,
      docUrl: `/api/facturacion/ticket/${sale.id}`,
    };
  });
}
