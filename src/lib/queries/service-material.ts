import { createClient } from "@/lib/supabase/client";
import type { ServiceMaterial } from "@/types/database";

/**
 * Fila del escandallo (BOM) de un servicio, enriquecida con los datos de
 * visualización del producto que consume (nombre, unidad, stock actual).
 * Mismo patrón que `CustomerVisit` en `@/lib/queries/customers.ts`: join
 * embebido de Supabase tipado con `.returns<T[]>()`.
 */
export type ServiceMaterialWithProduct = ServiceMaterial & {
  product: { name: string; unit: string; stock: number | null };
};

/**
 * Fábrica de claves de caché para TanStack Query.
 * Se scopea por `salonId` (aislamiento de tenants) y por `serviceId`.
 */
export const serviceMaterialKeys = {
  all: (salonId: string) => ["service-material", salonId] as const,
  lists: (salonId: string) => [...serviceMaterialKeys.all(salonId), "list"] as const,
  list: (salonId: string, serviceId: string) =>
    [...serviceMaterialKeys.lists(salonId), serviceId] as const,
};

/**
 * Materiales que consume un servicio (su escandallo), con los datos de
 * visualización del producto embebidos, ordenados por antigüedad de alta.
 */
export async function fetchServiceMaterials(
  salonId: string,
  serviceId: string,
): Promise<ServiceMaterialWithProduct[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_material")
    .select("*, product:products(name, unit, stock)")
    .eq("salon_id", salonId)
    .eq("service_id", serviceId)
    .order("created_at", { ascending: true })
    .returns<ServiceMaterialWithProduct[]>();

  if (error !== null) throw new Error(error.message);
  return data;
}
