import { createClient } from "@/lib/supabase/client";
import type { Service } from "@/types/database";

/**
 * Fábrica de claves de caché para TanStack Query.
 * Todo se scopea por `salonId` para aislar tenants en la caché.
 */
export const serviceKeys = {
  all: (salonId: string) => ["services", salonId] as const,
  lists: (salonId: string) => [...serviceKeys.all(salonId), "list"] as const,
  list: (salonId: string, search: string) =>
    [...serviceKeys.lists(salonId), { search }] as const,
};

/**
 * Catálogo de servicios del salón, opcionalmente filtrado por texto libre
 * (nombre o categoría). Ordenado alfabéticamente por nombre.
 */
export async function fetchServices(
  salonId: string,
  search: string,
): Promise<Service[]> {
  const supabase = createClient();
  let query = supabase
    .from("services")
    .select("*")
    .eq("salon_id", salonId)
    .order("name", { ascending: true });

  const term = search.trim();
  if (term !== "") {
    const pattern = `%${term}%`;
    query = query.or(`name.ilike.${pattern},category.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}
