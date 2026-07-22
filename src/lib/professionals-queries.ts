// Capa de datos de PROFESIONALES — parte de I/O (Supabase). Puente entre la lógica pura de
// `professionals.ts` y la BD de Salón OS. Aquí SOLO va la llamada de red: se construye la
// consulta a `professionals` acotada por `salon_id` (multi-tenant), con el embed de servicios
// (professional_services → services), ordenada por `full_name`, y se devuelve ya mapeada al
// modelo de vista.
//
// El `salon_id` NO se resuelve aquí: llega como argumento (lo inyecta `useSalonId()` desde el
// hook `use-professionals.ts`). Mantener el fetch parametrizado por `salonId` lo hace testeable
// y desacoplado del DOM.
//
// ⛔ SOLO LECTURA. Este módulo únicamente LEE el personal del salón; el alta/edición/baja del
// personal vive en el panel de Salón OS. No hay inserts/updates/deletes.

import { supabase } from '@/integrations/supabase/client';
import {
  PROFESSIONALS_SELECT,
  mapProfessionalRows,
  sortByFullName,
  type ProfessionalListItem,
  type ProfessionalRow,
} from '@/lib/professionals';

/** Parámetros de la consulta del listado de personal. */
export interface FetchProfessionalsParams {
  /** salon_id EFECTIVO ya resuelto en runtime (de `useSalonId()`). Obligatorio. */
  salonId: string;
  /**
   * Si es `true`, restringe a `active = true` (útil para un futuro selector de profesional en
   * los flujos de cita/venta). Por defecto `false`: la vista de administración muestra también
   * a los inactivos, con su etiqueta de estado.
   */
  activeOnly?: boolean;
  /** Señal de cancelación (React Query la provee para abortar peticiones obsoletas). */
  signal?: AbortSignal;
}

/**
 * Lee los profesionales del salón, con los servicios que presta embebidos en la MISMA consulta
 * (sin N+1), ordenados por nombre.
 *
 * - Acota SIEMPRE por `salon_id` (multi-tenant): sin salón resuelto no hay consulta.
 * - `activeOnly` aplica el filtro `active = true` server-side cuando se pide.
 * - El tipo del resultado se fija con `.returns<ProfessionalRow[]>()` (los embeds con hint de FK
 *   no se infieren solos de forma fiable).
 * - Se re-ordena en cliente con `sortByFullName` (collation ES) para acentos/ñ y desempate estable.
 *
 * Lanza el `PostgrestError` si la consulta falla, para que React Query lo trate como error.
 */
export async function fetchProfessionals({
  salonId,
  activeOnly = false,
  signal,
}: FetchProfessionalsParams): Promise<ProfessionalListItem[]> {
  if (!salonId) {
    throw new Error('fetchProfessionals: salonId es obligatorio (salón sin resolver).');
  }

  let filter = supabase
    .from('professionals')
    .select(PROFESSIONALS_SELECT)
    .eq('salon_id', salonId);

  if (activeOnly) {
    filter = filter.eq('active', true);
  }

  let query = filter.order('full_name', { ascending: true });
  if (signal) {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query.returns<ProfessionalRow[]>();
  if (error) throw error;
  return sortByFullName(mapProfessionalRows(data));
}
