// Capa de datos de CITAS — parte de I/O (Supabase). Puente entre la lógica pura de
// `appointments.ts` y la BD de Salón OS. Aquí SOLO va la llamada de red: se construye la
// consulta a `appointments` acotada por `salon_id` y por rango de `starts_at`, con los
// joins embebidos (customers/services/professionals), ordenada por `starts_at`, y se
// devuelven ya mapeadas al modelo de vista.
//
// El `salon_id` NO se resuelve aquí: llega como argumento. Su resolución en runtime
// (subdominio > ?salon= > VITE_SALON_SLUG → RPC get_salon_branding → salons.id) vive en
// `salon.ts` + `salon-context.tsx`, y se inyecta vía `useSalonId()` desde el hook
// `use-appointments.ts`. Mantener el fetch parametrizado por `salonId` lo hace testeable
// y desacoplado del DOM.
//
// ⛔ SIN RECALCULAR DISPONIBILIDAD EN CLIENTE: esta capa solo LEE citas existentes.

import { supabase } from '@/integrations/supabase/client';
import {
  APPOINTMENTS_SELECT,
  dayRange,
  mapAppointmentRows,
  weekRange,
  type AppointmentListItem,
  type AppointmentRow,
  type AppointmentStatus,
  type DateRange,
  type WeekStartsOn,
} from '@/lib/appointments';

/** Filtros opcionales comunes a las consultas de agenda. */
export interface AppointmentsFilter {
  /** Restringe a un profesional (útil con el selector de profesional de la agenda). */
  professionalId?: string;
  /** Restringe a ciertos estados (p. ej. excluir `cancelled`). Vacío/omitido ⇒ todos. */
  statuses?: AppointmentStatus[];
  /** Señal de cancelación (React Query la provee para abortar peticiones obsoletas). */
  signal?: AbortSignal;
}

/** Parámetros completos de una consulta por rango arbitrario de `starts_at`. */
export interface FetchAppointmentsParams extends AppointmentsFilter {
  /** salon_id EFECTIVO ya resuelto en runtime (de `useSalonId()`). Obligatorio. */
  salonId: string;
  /** Rango semiabierto `[gte, lt)` de `starts_at`. */
  range: DateRange;
}

/**
 * Consulta base: citas del salón cuyo `starts_at` cae en `[range.gte, range.lt)`, con los
 * joins embebidos y ordenadas por `starts_at` ascendente. Devuelve el modelo de vista.
 *
 * - Acota SIEMPRE por `salon_id` (multi-tenant): sin salón resuelto no hay consulta.
 * - Usa `>=` / `<` (intervalo semiabierto) para no duplicar citas en la frontera.
 * - Filtros opcionales `professionalId` / `statuses` se aplican server-side.
 * - El tipo del resultado se fija con `.returns<AppointmentRow[]>()` (los embeds con hint
 *   de FK no se infieren solos de forma fiable).
 *
 * Lanza el `PostgrestError` si la consulta falla, para que React Query lo trate como error.
 */
export async function fetchAppointmentsInRange({
  salonId,
  range,
  professionalId,
  statuses,
  signal,
}: FetchAppointmentsParams): Promise<AppointmentListItem[]> {
  if (!salonId) {
    throw new Error('fetchAppointmentsInRange: salonId es obligatorio (salón sin resolver).');
  }

  // Filtros (todos devuelven un PostgrestFilterBuilder ⇒ se pueden encadenar/condicionar).
  let filter = supabase
    .from('appointments')
    .select(APPOINTMENTS_SELECT)
    .eq('salon_id', salonId)
    .gte('starts_at', range.gte)
    .lt('starts_at', range.lt);

  if (professionalId) {
    filter = filter.eq('professional_id', professionalId);
  }
  if (statuses && statuses.length > 0) {
    filter = filter.in('status', statuses);
  }

  // Orden + (opcional) cancelación. `.returns` fija el tipo de la fila embebida.
  let query = filter.order('starts_at', { ascending: true });
  if (signal) {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query.returns<AppointmentRow[]>();
  if (error) throw error;
  return mapAppointmentRows(data);
}

/**
 * Citas de un DÍA (`ref` en hora local del dispositivo). Azúcar sobre
 * `fetchAppointmentsInRange` con el rango de `dayRange(ref)`.
 */
export function fetchDayAppointments(
  salonId: string,
  ref: Date,
  filter: AppointmentsFilter = {},
): Promise<AppointmentListItem[]> {
  return fetchAppointmentsInRange({ salonId, range: dayRange(ref), ...filter });
}

/**
 * Citas de una SEMANA (por defecto empezando en lunes). Azúcar sobre
 * `fetchAppointmentsInRange` con el rango de `weekRange(ref, weekStartsOn)`.
 */
export function fetchWeekAppointments(
  salonId: string,
  ref: Date,
  filter: AppointmentsFilter = {},
  weekStartsOn?: WeekStartsOn,
): Promise<AppointmentListItem[]> {
  return fetchAppointmentsInRange({ salonId, range: weekRange(ref, weekStartsOn), ...filter });
}
