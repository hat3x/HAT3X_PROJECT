import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useSalon } from '@/lib/salon-context';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Ficha SELF del cliente REDUCIDA a lo que la app consume: identidad + contacto.
 * Selección de columnas EXPLÍCITA (no `*`) por mínimo privilegio: la RLS filtra FILAS,
 * no COLUMNAS (mismo criterio que useAppointments), así que se pide sólo lo necesario y
 * NO se traen al cliente campos sensibles/irrelevantes de la ficha (p. ej. `qr_token`,
 * `tax_id`, `notes`, `address`, `birth_date`). `phone_e164` es el teléfono normalizado
 * con el que el servidor enlaza/reutiliza la ficha (lo usa el prellenado de la reserva).
 */
export type Customer = Pick<
  Tables<'customers'>,
  'id' | 'full_name' | 'phone' | 'phone_e164' | 'email'
>;

/** Columnas de la ficha que la app necesita (id para las FKs; contacto para la reserva). */
const CUSTOMER_COLUMNS = 'id, full_name, phone, phone_e164, email';

export const useCustomer = () => {
  const { user } = useAuth();
  // salon_id se deriva del salón resuelto en runtime (no de VITE_SALON_ID).
  const { id: salonId } = useSalon();

  const query = useQuery({
    queryKey: ['customer', user?.id, salonId],
    queryFn: async () => {
      // Lectura "self" del cliente: su propia fila (user_id = auth.uid())
      // dentro del salón actual. maybeSingle → null si aún no tiene ficha,
      // sin lanzar (p. ej. justo tras el registro).
      const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_COLUMNS)
        .eq('user_id', user!.id)
        .eq('salon_id', salonId)
        .maybeSingle();
      if (error) throw error;
      return data as Customer | null;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 min — customer profile rarely changes mid-session
    retry: 1,
  });

  return {
    customer: query.data ?? null,
    customerId: query.data?.id ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
};
