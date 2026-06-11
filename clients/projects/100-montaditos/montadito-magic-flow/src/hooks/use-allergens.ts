import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Allergen {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  orden: number;
}

export function useAllergens() {
  return useQuery({
    queryKey: ['alergenos'],
    queryFn: async (): Promise<Allergen[]> => {
      const { data, error } = await supabase
        .from('alergenos' as any)
        .select('*')
        .order('orden');
      if (error) throw error;
      return (data ?? []) as unknown as Allergen[];
    },
    staleTime: 5 * 60_000,
  });
}
