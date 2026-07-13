import { createClient } from "@/lib/supabase/client";
import type { Location } from "@/types/database";

/**
 * Fábrica de claves de caché para TanStack Query.
 * Todo se scopea por `salonId` para aislar tenants en la caché.
 */
export const locationKeys = {
  all: (salonId: string) => ["locations", salonId] as const,
  lists: (salonId: string) => [...locationKeys.all(salonId), "list"] as const,
  list: (salonId: string, includeInactive: boolean) =>
    [...locationKeys.lists(salonId), { includeInactive }] as const,
};

/**
 * Lista de sedes del salón. Por defecto incluye activas e inactivas para que
 * el panel de ajustes pueda mostrar y reactivar sedes desactivadas.
 * Ordenadas con las activas primero y luego alfabéticamente.
 */
export async function fetchLocations(
  salonId: string,
  includeInactive = true,
): Promise<Location[]> {
  const supabase = createClient();
  let query = supabase
    .from("locations")
    .select("*")
    .eq("salon_id", salonId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}
