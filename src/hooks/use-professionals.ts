// Cableado de la capa de datos de PROFESIONALES con React Query. Es el punto donde el
// `salon_id` RESUELTO EN RUNTIME (subdominio > ?salon= > VITE_SALON_SLUG, vía `useSalonId()`)
// se inyecta en la consulta de `professionals-queries.ts`. La UI consume este hook; no habla
// con Supabase directamente.
//
// ⛔ SOLO LECTURA: este hook solo LEE el personal del salón (listado de administración). El
// alta/edición/baja del personal vive en el panel de Salón OS.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSalonId } from '@/lib/salon-context';
import type { ProfessionalListItem } from '@/lib/professionals';
import { fetchProfessionals } from '@/lib/professionals-queries';

/** Opciones del hook de personal (filtro server-side + control de habilitado). */
export interface UseProfessionalsOptions {
  /** Restringe a `active = true` (p. ej. para un selector de profesional). Omitido ⇒ todos. */
  activeOnly?: boolean;
  /** Permite desactivar la consulta (por defecto activa cuando hay salón). */
  enabled?: boolean;
}

/**
 * Fábrica de claves de caché de personal. Namespacing por `salon_id` para que el cambio de
 * salón invalide de forma natural; `activeOnly` forma parte de la clave para que la lista
 * completa y la de solo-activos tengan entradas de caché distintas.
 */
export const professionalsKeys = {
  all: (salonId: string) => ['professionals', salonId] as const,
  list: (salonId: string, activeOnly: boolean) =>
    ['professionals', salonId, { activeOnly }] as const,
};

/**
 * Hook: profesionales del salón resuelto, con sus servicios embebidos. Toda la resolución del
 * `salon_id` ocurre aquí (via `useSalonId()`); el resto es delegación a la consulta.
 */
export function useProfessionals(
  options: UseProfessionalsOptions = {},
): UseQueryResult<ProfessionalListItem[], Error> {
  const salonId = useSalonId();
  const { activeOnly = false, enabled = true } = options;

  return useQuery({
    queryKey: professionalsKeys.list(salonId, activeOnly),
    queryFn: ({ signal }) => fetchProfessionals({ salonId, activeOnly, signal }),
    // Sin salón resuelto no hay consulta (aunque dentro del SalonProvider siempre lo hay).
    enabled: enabled && Boolean(salonId),
  });
}
