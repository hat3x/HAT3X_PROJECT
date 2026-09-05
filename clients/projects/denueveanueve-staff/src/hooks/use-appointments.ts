// Cableado de la capa de datos de CITAS con React Query. Es el punto donde el `salon_id`
// RESUELTO EN RUNTIME (subdominio > ?salon= > VITE_SALON_SLUG, vía `useSalonId()`) se
// inyecta en las consultas de `appointments-queries.ts`. La UI consume estos hooks; no
// habla con Supabase directamente.
//
// Claves de caché estables: se construyen a partir de las FRONTERAS del rango
// (`range.gte`/`range.lt`), que `dayRange`/`weekRange` normalizan a medianoche. Así, aunque
// el consumidor pase `new Date()` (instante distinto en cada render), la clave del día/semana
// NO cambia y React Query no dispara refetches innecesarios.
//
// ⛔ SIN RECALCULAR DISPONIBILIDAD EN CLIENTE: estos hooks solo LEEN citas.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSalonId } from '@/lib/salon-context';
import {
  dayRange,
  weekRange,
  type AppointmentListItem,
  type AppointmentStatus,
  type DateRange,
  type WeekStartsOn,
} from '@/lib/appointments';
import { fetchAppointmentsInRange } from '@/lib/appointments-queries';

/** Opciones de los hooks de agenda (filtros server-side + control de habilitado). */
export interface UseAppointmentsOptions {
  /** Restringe a un profesional (selector de profesional de la agenda). */
  professionalId?: string;
  /** Restringe a ciertos estados (p. ej. excluir `cancelled`). Omitido ⇒ todos. */
  statuses?: AppointmentStatus[];
  /** Permite desactivar la consulta (por defecto activa cuando hay salón). */
  enabled?: boolean;
}

/**
 * Fábrica de claves de caché de citas. Namespacing por `salon_id` para que el cambio de
 * salón invalide de forma natural. Las fronteras del rango y los filtros forman parte de
 * la clave para que día/semana/profesional/estado tengan entradas de caché distintas.
 */
export const appointmentsKeys = {
  all: (salonId: string) => ['appointments', salonId] as const,
  range: (
    salonId: string,
    range: DateRange,
    filter?: Pick<UseAppointmentsOptions, 'professionalId' | 'statuses'>,
  ) =>
    [
      'appointments',
      salonId,
      range.gte,
      range.lt,
      filter?.professionalId ?? null,
      filter?.statuses ?? null,
    ] as const,
};

/**
 * Hook base: citas del salón resuelto cuyo `starts_at` cae en `range`. Toda la resolución
 * del `salon_id` ocurre aquí (via `useSalonId()`); el resto es delegación a la consulta.
 */
export function useAppointmentsInRange(
  range: DateRange,
  options: UseAppointmentsOptions = {},
): UseQueryResult<AppointmentListItem[], Error> {
  const salonId = useSalonId();
  const { professionalId, statuses, enabled = true } = options;

  return useQuery({
    queryKey: appointmentsKeys.range(salonId, range, { professionalId, statuses }),
    queryFn: ({ signal }) =>
      fetchAppointmentsInRange({ salonId, range, professionalId, statuses, signal }),
    // Sin salón resuelto no hay consulta (aunque dentro del SalonProvider siempre lo hay).
    enabled: enabled && Boolean(salonId),
  });
}

/**
 * Citas de un DÍA (`ref` en hora local del dispositivo). El rango se recalcula por render
 * pero su clave de caché es estable dentro del mismo día natural.
 */
export function useDayAppointments(
  ref: Date,
  options?: UseAppointmentsOptions,
): UseQueryResult<AppointmentListItem[], Error> {
  return useAppointmentsInRange(dayRange(ref), options);
}

/**
 * Citas de una SEMANA (por defecto empezando en lunes). `weekStartsOn` permite cambiar el
 * primer día de la semana si algún salón lo necesitara.
 */
export function useWeekAppointments(
  ref: Date,
  options: UseAppointmentsOptions & { weekStartsOn?: WeekStartsOn } = {},
): UseQueryResult<AppointmentListItem[], Error> {
  const { weekStartsOn, ...rest } = options;
  return useAppointmentsInRange(weekRange(ref, weekStartsOn), rest);
}
