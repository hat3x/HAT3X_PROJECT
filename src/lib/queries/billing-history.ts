import { createClient } from "@/lib/supabase/client";

/**
 * Factura histórica del paciente (tabla billing_history). Registro de solo
 * lectura importado del software dental de origen. Ver
 * 20260806130000_billing_history.sql.
 */
export type BillingEntry = {
  id: string;
  issued_on: string;
  full_number: string | null;
  total_cents: number;
  tax_cents: number | null;
  paid: boolean;
  paid_on: string | null;
  payment_method: string | null;
  status: string | null;
  concept: string | null;
};

/** Fábrica de claves de caché para la facturación histórica (TanStack Query). */
export const billingHistoryKeys = {
  all: (salonId: string) => ["billing-history", salonId] as const,
  patient: (salonId: string, customerId: string) =>
    [...billingHistoryKeys.all(salonId), customerId] as const,
};

/**
 * Devuelve las facturas históricas de un paciente, de más reciente a más antigua.
 */
export async function fetchBillingHistory(
  salonId: string,
  customerId: string,
): Promise<BillingEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("billing_history")
    .select(
      "id, issued_on, full_number, total_cents, tax_cents, paid, paid_on, payment_method, status, concept",
    )
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("issued_on", { ascending: false })
    .returns<BillingEntry[]>();

  if (error !== null) {
    throw new Error(error.message);
  }

  return data ?? [];
}
