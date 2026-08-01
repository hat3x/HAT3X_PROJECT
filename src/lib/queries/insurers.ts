import { createClient } from "@/lib/supabase/client";
import type { CustomerInsurance, Insurer, InsurerServicePrice } from "@/types/database";

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const insurerKeys = {
  all: (salonId: string) => ["insurers", salonId] as const,
  lists: (salonId: string) => [...insurerKeys.all(salonId), "list"] as const,
  customerInsurances: (salonId: string, customerId: string) =>
    [...insurerKeys.all(salonId), "customer", customerId] as const,
  tariff: (salonId: string, insurerId: string) =>
    [...insurerKeys.all(salonId), "tariff", insurerId] as const,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Catálogo de aseguradoras del salón, ordenado alfabéticamente. */
export async function fetchInsurers(salonId: string): Promise<Insurer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("insurer")
    .select("*")
    .eq("salon_id", salonId)
    .order("name", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/** Póliza de un paciente enriquecida con el nombre de la aseguradora. */
export type CustomerInsuranceWithInsurer = CustomerInsurance & {
  insurer: { name: string } | null;
};

/**
 * Seguros/mutuas de un paciente, más recientes primero. Acotada por
 * `salon_id` (multi-tenant) y `customer_id`.
 */
export async function fetchCustomerInsurances(
  salonId: string,
  customerId: string,
): Promise<CustomerInsuranceWithInsurer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_insurance")
    .select("*, insurer:insurer(name)")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .returns<CustomerInsuranceWithInsurer[]>();

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/** Línea del baremo enriquecida con el nombre del servicio. */
export type InsurerServicePriceWithService = InsurerServicePrice & {
  service: { name: string } | null;
};

/**
 * Baremo (precio por servicio) de una aseguradora. Acotada por `salon_id`
 * (multi-tenant) e `insurer_id`.
 */
export async function fetchInsurerTariff(
  salonId: string,
  insurerId: string,
): Promise<InsurerServicePriceWithService[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("insurer_service_price")
    .select("*, service:services(name)")
    .eq("salon_id", salonId)
    .eq("insurer_id", insurerId)
    .returns<InsurerServicePriceWithService[]>();

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
