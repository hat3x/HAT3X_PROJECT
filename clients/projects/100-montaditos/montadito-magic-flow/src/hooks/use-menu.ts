import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProductAllergen {
  codigo: string;
  nombre: string;
  icono: string | null;
}

const MENU_STALE_TIME = 5 * 60 * 1000; // 5 min — el menú no cambia con frecuencia

export function useCategories() {
  return useQuery({
    queryKey: ['menu-categories'],
    staleTime: MENU_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_categorias')
        .select('*')
        .order('orden');
      if (error) throw error;
      return data;
    },
  });
}

export function useProducts(categoriaId?: string) {
  return useQuery({
    queryKey: ['menu-products', categoriaId],
    staleTime: MENU_STALE_TIME,
    queryFn: async () => {
      let query = supabase
        .from('menu_productos')
        .select('*, producto_alergenos(alergenos(id, codigo, nombre, icono, orden))')
        .eq('disponible', true);
      if (categoriaId) query = query.eq('categoria_id', categoriaId);
      const { data, error } = await query.order('destacado', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => {
        const alergenos: ProductAllergen[] = (p.producto_alergenos ?? [])
          .map((pa: any) => pa.alergenos)
          .filter(Boolean)
          .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
          .map((a: any) => ({ codigo: a.codigo, nombre: a.nombre, icono: a.icono }));
        return { ...p, alergenos };
      });
    },
  });
}
