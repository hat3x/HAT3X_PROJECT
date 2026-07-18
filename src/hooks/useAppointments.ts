// Hook de dominio de "Mis Citas": lee las citas del cliente autenticado y las deja
// listas para la UI (próximas/historial, con nombres y estados de carga/error).
//
// FUENTE DE VERDAD (requisito de la subtarea): la lista sale de public.appointments
// leída con el SDK de Supabase. La ve el cliente gracias a la política RLS SELF de
// solo lectura de sub-7 ("self_select_own_appointments"): solo sus propias citas.
// Se filtra además por (customer_id, salon_id) —la FK compuesta garantiza que van de
// la mano— igual que el resto del autoservicio (ver Loyalty.tsx). Selección de
// columnas EXPLÍCITA (no `*`): se omiten `notes`/`cancelled_reason`, que pueden traer
// notas internas del staff (RLS no filtra columnas; se hace en la capa de app).
//
// ENRIQUECIDO NO BLOQUEANTE: la fila trae service_id/professional_id (uuids), pero el
// cliente NO puede leer las tablas services/professionals (RLS de staff). Los nombres
// se resuelven con el CATÁLOGO PÚBLICO (endpoint bootstrap anónimo de salon-os-api).
// Si esa segunda consulta falla o tarda, las citas se muestran igual (sin nombres):
// nunca convierte una carga correcta de citas en un error.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSalon } from '@/lib/salon-context';
import { useCustomer } from '@/hooks/useCustomer';
import { createSalonOsApi } from '@/lib/salon-os-api';
import {
  buildCatalogIndex,
  enrichAppointment,
  partitionAppointments,
  type AppointmentRow,
  type CatalogIndex,
  type EnrichedAppointment,
} from '@/lib/appointments';

/** Columnas que necesita la pantalla (sin notes/cancelled_reason: ver cabecera). */
const APPOINTMENT_COLUMNS =
  'id, starts_at, ends_at, status, service_id, professional_id, price_cents, currency';

/** Tope defensivo: un cliente tiene pocas citas; evita payloads patológicos. */
const MAX_APPOINTMENTS = 200;

export interface UseAppointmentsResult {
  /** Cargando la lista de citas (o la ficha del cliente de la que depende). */
  isLoading: boolean;
  /** La lectura de citas (o de la ficha) falló. */
  isError: boolean;
  error: unknown;
  /** Reintenta la lectura de citas (y el catálogo si estaba en error). */
  refetch: () => void;
  /** Próximas, orden ascendente (la más cercana primero). */
  upcoming: EnrichedAppointment[];
  /** Historial, orden descendente (la más reciente primero). */
  history: EnrichedAppointment[];
  /** El cliente no tiene ninguna cita (ni ficha) — estado vacío legible. */
  isEmpty: boolean;
  /** true mientras el catálogo (nombres) aún se resuelve: la UI muestra un placeholder. */
  catalogPending: boolean;
  /** Zona horaria del salón (del catálogo), para formatear en la hora del salón. */
  timezone: string | null;
}

export function useAppointments(): UseAppointmentsResult {
  const { id: salonId, slug } = useSalon();
  const { customerId, isLoading: customerLoading, error: customerError } = useCustomer();

  // 1) Las citas del cliente (RLS self de sub-7). Deshabilitada hasta tener ficha.
  const appointmentsQuery = useQuery({
    queryKey: ['appointments', salonId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(APPOINTMENT_COLUMNS)
        .eq('customer_id', customerId as string)
        .eq('salon_id', salonId)
        .order('starts_at', { ascending: false })
        .limit(MAX_APPOINTMENTS);
      if (error) throw error;
      return (data ?? []) as AppointmentRow[];
    },
    enabled: !!customerId && !!salonId,
    staleTime: 1000 * 60, // 1 min
    retry: 1,
  });

  // 2) Catálogo público del salón (nombres + zona horaria). Enriquecido opcional.
  const catalogQuery = useQuery({
    queryKey: ['salon-bootstrap', slug],
    queryFn: ({ signal }) => createSalonOsApi({ slug }).getBootstrap(signal),
    enabled: !!slug,
    staleTime: 1000 * 60 * 30, // 30 min: el catálogo cambia poco
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });

  const index: CatalogIndex | null = useMemo(
    () => (catalogQuery.data ? buildCatalogIndex(catalogQuery.data) : null),
    [catalogQuery.data],
  );

  const { upcoming, history } = useMemo(() => {
    const enriched = (appointmentsQuery.data ?? []).map((r) => enrichAppointment(r, index));
    // Date.now() en el momento del render: la frontera "próxima/pasada" se recalcula
    // cuando cambian las citas o el catálogo, suficiente para esta pantalla.
    return partitionAppointments(enriched, Date.now());
  }, [appointmentsQuery.data, index]);

  const isLoading = customerLoading || (!!customerId && appointmentsQuery.isPending);
  const isError = !!customerError || appointmentsQuery.isError;
  const count = appointmentsQuery.data?.length ?? 0;

  return {
    isLoading,
    isError,
    error: customerError ?? appointmentsQuery.error,
    refetch: () => {
      void appointmentsQuery.refetch();
      if (catalogQuery.isError) void catalogQuery.refetch();
    },
    upcoming,
    history,
    isEmpty: !isLoading && !isError && count === 0,
    catalogPending: !!slug && catalogQuery.isPending,
    timezone: index?.timezone ?? null,
  };
}
