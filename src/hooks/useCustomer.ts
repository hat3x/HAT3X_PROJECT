import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { SALON_ID } from '@/lib/salon';
import type { Tables } from '@/integrations/supabase/types';

export type Customer = Tables<'customers'>;

export const useCustomer = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['customer', user?.id, SALON_ID],
    queryFn: async () => {
      // Lectura "self" del cliente: su propia fila (user_id = auth.uid())
      // dentro del salón actual. maybeSingle → null si aún no tiene ficha,
      // sin lanzar (p. ej. justo tras el registro).
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user!.id)
        .eq('salon_id', SALON_ID)
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
