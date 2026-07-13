import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/types/database";

/**
 * Fábrica de claves de caché para TanStack Query.
 * Todo se scopea por `salonId` para aislar tenants en la caché.
 */
export const productKeys = {
  all: (salonId: string) => ["products", salonId] as const,
  lists: (salonId: string) => [...productKeys.all(salonId), "list"] as const,
  list: (salonId: string, search: string, includeInactive: boolean) =>
    [...productKeys.lists(salonId), { search, includeInactive }] as const,
  details: (salonId: string) => [...productKeys.all(salonId), "detail"] as const,
  detail: (salonId: string, productId: string) =>
    [...productKeys.details(salonId), productId] as const,
};

/**
 * Catálogo de productos del salón, opcionalmente filtrado por texto libre
 * (nombre o descripción). Ordenado alfabéticamente. Por defecto oculta los
 * productos desactivados.
 */
export async function fetchProducts(
  salonId: string,
  search: string,
  includeInactive: boolean,
): Promise<Product[]> {
  const supabase = createClient();
  let query = supabase
    .from("products")
    .select("*")
    .eq("salon_id", salonId)
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const term = search.trim();
  if (term !== "") {
    const pattern = `%${term}%`;
    query = query.or(`name.ilike.${pattern},description.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}

/** Ficha individual de un producto. `null` si no existe o no es accesible. */
export async function fetchProduct(
  salonId: string,
  productId: string,
): Promise<Product | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("salon_id", salonId)
    .eq("id", productId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}
