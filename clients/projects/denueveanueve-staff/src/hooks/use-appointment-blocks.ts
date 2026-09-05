// Cableado con React Query de los TRAMOS de cita (`appointment_blocks`). Igual que
// `use-appointments.ts`, aquí se inyecta el `salon_id` RESUELTO EN RUNTIME (via `useSalonId()`)
// en la consulta de `appointment-blocks-queries.ts`. La UI consume este hook para pintar el
// desglose de fases (aplicación/exposición/post) de las citas que ya tiene en pantalla.
//
// Es una MEJORA OPCIONAL sobre la agenda: si no hay tramos (o la consulta falla), la agenda
// sigue mostrando las citas tal cual. Por eso el hook se declara aparte de las citas y su error
// no se propaga a la lista.
//
// ⛔ SIN RECALCULAR DISPONIBILIDAD EN CLIENTE: solo LEE ventanas `occupied_range` del servidor.

import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSalonId } from '@/lib/salon-context';
import type { AppointmentBlock } from '@/lib/appointment-blocks';
import { fetchAppointmentBlocks } from '@/lib/appointment-blocks-queries';

/** Opciones del hook de tramos (control de habilitado). */
export interface UseAppointmentBlocksOptions {
  /** Permite desactivar la consulta (por defecto activa cuando hay salón e ids). */
  enabled?: boolean;
}

/**
 * Fábrica de claves de caché de tramos. Namespacing por `salon_id`; el conjunto ORDENADO de ids
 * forma parte de la clave para que dos vistas con las mismas citas compartan caché y el orden de
 * llegada de los ids no genere entradas distintas.
 */
export const appointmentBlocksKeys = {
  all: (salonId: string) => ['appointment-blocks', salonId] as const,
  forAppointments: (salonId: string, appointmentIds: string[]) =>
    ['appointment-blocks', salonId, appointmentIds] as const,
};

/**
 * Tramos de las citas indicadas para el salón resuelto. Ordena los ids (clave de caché estable) y
 * solo consulta cuando hay salón e ids. Devuelve la lista PLANA de tramos; la UI la agrupa por
 * cita con `groupBlocksByAppointment` (misma división pura/presentación que el resto de la agenda).
 */
export function useAppointmentBlocks(
  appointmentIds: string[],
  options: UseAppointmentBlocksOptions = {},
): UseQueryResult<AppointmentBlock[], Error> {
  const salonId = useSalonId();
  const { enabled = true } = options;

  // Orden estable (copia, sin mutar la entrada) para una clave de caché determinista.
  const sortedIds = useMemo(() => [...appointmentIds].sort(), [appointmentIds]);

  return useQuery({
    queryKey: appointmentBlocksKeys.forAppointments(salonId, sortedIds),
    queryFn: ({ signal }) =>
      fetchAppointmentBlocks({ salonId, appointmentIds: sortedIds, signal }),
    enabled: enabled && Boolean(salonId) && sortedIds.length > 0,
  });
}
