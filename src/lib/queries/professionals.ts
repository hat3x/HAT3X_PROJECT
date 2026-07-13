import { createClient } from "@/lib/supabase/client";
import type { Professional } from "@/types/database";

/**
 * Fábrica de claves de caché para TanStack Query.
 * Todo se scopea por `salonId` para aislar tenants en la caché.
 */
export const professionalKeys = {
  all: (salonId: string) => ["professionals", salonId] as const,
  lists: (salonId: string) => [...professionalKeys.all(salonId), "list"] as const,
  list: (salonId: string, search: string) =>
    [...professionalKeys.lists(salonId), { search }] as const,
};

/**
 * Profesional junto con los ids de los servicios que presta (relación N:M
 * `professional_services`). Los datos de la sede se resuelven en la vista a
 * partir de la lista de sedes ya cacheada, evitando un embed adicional.
 */
export interface ProfessionalWithServices extends Professional {
  /** Ids de los servicios que presta el profesional. */
  service_ids: string[];
}

/**
 * Lista de profesionales del salón, opcionalmente filtrada por texto libre
 * (nombre o email). Ordenados con los activos primero y luego alfabéticamente.
 *
 * Se realiza en dos consultas (profesionales + vínculos N:M) y se compone el
 * resultado en memoria, en lugar de un embed, para mantener un tipado estricto
 * y evitar acoplar la forma de la respuesta a los joins de PostgREST.
 */
export async function fetchProfessionals(
  salonId: string,
  search: string,
): Promise<ProfessionalWithServices[]> {
  const supabase = createClient();

  let query = supabase
    .from("professionals")
    .select("*")
    .eq("salon_id", salonId)
    .order("active", { ascending: false })
    .order("full_name", { ascending: true });

  const term = search.trim();
  if (term !== "") {
    const pattern = `%${term}%`;
    query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
  }

  const { data: professionals, error } = await query;
  if (error !== null) {
    throw new Error(error.message);
  }
  if (professionals.length === 0) {
    return [];
  }

  const { data: links, error: linksError } = await supabase
    .from("professional_services")
    .select("professional_id, service_id")
    .eq("salon_id", salonId);
  if (linksError !== null) {
    throw new Error(linksError.message);
  }

  const serviceIdsByProfessional = new Map<string, string[]>();
  for (const link of links) {
    const current = serviceIdsByProfessional.get(link.professional_id) ?? [];
    current.push(link.service_id);
    serviceIdsByProfessional.set(link.professional_id, current);
  }

  return professionals.map((professional) => ({
    ...professional,
    service_ids: serviceIdsByProfessional.get(professional.id) ?? [],
  }));
}
