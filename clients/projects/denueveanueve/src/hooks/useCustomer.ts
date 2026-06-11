import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import type { Tables } from '@/integrations/supabase/types';

export type Customer = Tables<'customers'>;

export const useCustomer = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['customer', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data as Customer;
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
