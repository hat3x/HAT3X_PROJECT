// Capa de datos de los TRAMOS de cita (`appointment_blocks`) — parte de I/O (Supabase). Puente
// entre la lógica pura de `appointment-blocks.ts` y la BD de Salón OS. Lee los tramos (fase +
// `occupied_range`) de un conjunto CONOCIDO de citas (las que la agenda ya cargó), acotando por
// `salon_id` + `appointment_id IN (...)`, y los devuelve ya mapeados al modelo de vista.
//
// El `salon_id` NO se resuelve aquí: llega como argumento (igual que en `appointments-queries.ts`).
//
// ⛔ SIN RECALCULAR DISPONIBILIDAD EN CLIENTE: esta capa solo LEE las ventanas `occupied_range`
// que el servidor ya calculó para pintar los tramos ocupados; jamás deriva free/busy.

import { supabase } from '@/integrations/supabase/client';
import {
  APPOINTMENT_BLOCKS_SELECT,
  mapAppointmentBlockRows,
  type AppointmentBlock,
  type AppointmentBlockRow,
} from '@/lib/appointment-blocks';

/** Parámetros de la consulta de tramos para un lote de citas ya cargadas. */
export interface FetchAppointmentBlocksParams {
  /** salon_id EFECTIVO ya resuelto en runtime (de `useSalonId()`). Obligatorio. */
  salonId: string;
  /** Ids de las citas visibles cuyos tramos se quieren pintar. Vacío ⇒ no hay consulta. */
  appointmentIds: string[];
  /** Señal de cancelación (React Query la provee para abortar peticiones obsoletas). */
  signal?: AbortSignal;
}

/**
 * Tramos (`appointment_blocks`) de las citas indicadas, acotados por `salon_id` (multi-tenant).
 * Devuelve el modelo de vista ya mapeado (fase normalizada + ventana ocupada parseada).
 *
 * - Con `appointmentIds` vacío devuelve `[]` SIN tocar la red (nada que pintar).
 * - Acota SIEMPRE por `salon_id`; sin salón resuelto es un error de programación.
 * - `.returns<AppointmentBlockRow[]>()` fija el tipo de la fila (el SELECT es un `string`).
 *
 * Lanza el `PostgrestError` si la consulta falla, para que React Query lo trate como error. La
 * agenda trata estos tramos como MEJORA opcional: un fallo aquí no rompe la lista de citas.
 */
export async function fetchAppointmentBlocks({
  salonId,
  appointmentIds,
  signal,
}: FetchAppointmentBlocksParams): Promise<AppointmentBlock[]> {
  if (!salonId) {
    throw new Error('fetchAppointmentBlocks: salonId es obligatorio (salón sin resolver).');
  }
  if (appointmentIds.length === 0) return [];

  let query = supabase
    .from('appointment_blocks')
    .select(APPOINTMENT_BLOCKS_SELECT)
    .eq('salon_id', salonId)
    .in('appointment_id', appointmentIds);

  if (signal) {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query.returns<AppointmentBlockRow[]>();
  if (error) throw error;
  return mapAppointmentBlockRows(data);
}
