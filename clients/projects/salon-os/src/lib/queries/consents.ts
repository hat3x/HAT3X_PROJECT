import { createClient } from "@/lib/supabase/client";
import type { Consent } from "@/types/database";

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const consentKeys = {
  all: (salonId: string) => ["consents", salonId] as const,
  list: (salonId: string, customerId: string) =>
    [...consentKeys.all(salonId), "list", customerId] as const,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Lista los consentimientos informados de un paciente, más recientes primero.
 * Acotada por salon_id (multi-tenant) y customer_id.
 */
export async function fetchConsents(
  salonId: string,
  customerId: string,
): Promise<Consent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("consents")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
