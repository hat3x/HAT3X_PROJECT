import { createClient } from "@/lib/supabase/client";
import type { Customer, Visit } from "@/types/database";

/**
 * Visita enriquecida con el nombre del/la profesional que la atendió.
 * `professional` es `null` cuando la visita no tiene profesional asociado.
 */
export type CustomerVisit = Visit & {
  professional: { full_name: string } | null;
};

/**
 * Fábrica de claves de caché para TanStack Query.
 * Todo se scopea por `salonId` para aislar tenants en la caché.
 */
export const customerKeys = {
  all: (salonId: string) => ["customers", salonId] as const,
  lists: (salonId: string) => [...customerKeys.all(salonId), "list"] as const,
  list: (salonId: string, search: string) =>
    [...customerKeys.lists(salonId), { search }] as const,
  details: (salonId: string) => [...customerKeys.all(salonId), "detail"] as const,
  detail: (salonId: string, customerId: string) =>
    [...customerKeys.details(salonId), customerId] as const,
  visits: (salonId: string, customerId: string) =>
    [...customerKeys.detail(salonId, customerId), "visits"] as const,
};

/**
 * Lista de clientes del salón, opcionalmente filtrada por texto libre
 * (nombre, email o teléfono). Ordenada alfabéticamente.
 */
export async function fetchCustomers(
  salonId: string,
  search: string,
): Promise<Customer[]> {
  const supabase = createClient();
  let query = supabase
    .from("customers")
    .select("*")
    .eq("salon_id", salonId)
    .order("full_name", { ascending: true });

  const term = search.trim();
  if (term !== "") {
    const pattern = `%${term}%`;
    query = query.or(
      `full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;
  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}

/** Ficha individual de un cliente. `null` si no existe o no es accesible. */
export async function fetchCustomer(
  salonId: string,
  customerId: string,
): Promise<Customer | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("salon_id", salonId)
    .eq("id", customerId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}

/** Historial de visitas de un cliente, de la más reciente a la más antigua. */
export async function fetchCustomerVisits(
  salonId: string,
  customerId: string,
): Promise<CustomerVisit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("visits")
    .select("*, professional:professionals(full_name)")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("visited_at", { ascending: false })
    .returns<CustomerVisit[]>();

  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}
