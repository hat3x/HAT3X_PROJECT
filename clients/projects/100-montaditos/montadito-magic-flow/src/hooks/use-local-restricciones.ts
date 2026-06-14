import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveLocal } from '@/lib/active-local';

export type LocalRestriccion = {
  id: string;
  local_id: string;
  producto_id: string | null;
  seccion: string | null;
  hora_limite: string | null; // 'HH:MM' o null
};

export function useLocalRestricciones() {
  const localId = useActiveLocal((s) => s.local?.id);

  return useQuery<LocalRestriccion[]>({
    queryKey: ['local-restricciones', localId],
    queryFn: async () => {
      if (!localId) return [];
      const { data, error } = await supabase
        .from('local_restricciones' as any)
        .select('id, local_id, producto_id, seccion, hora_limite')
        .eq('local_id', localId);
      if (error) throw error;
      return (data ?? []) as LocalRestriccion[];
    },
    enabled: !!localId,
    staleTime: 10 * 60 * 1000,
  });
}

function isActiveNow(r: LocalRestriccion): boolean {
  if (!r.hora_limite) return true;
  const [h, m] = r.hora_limite.split(':').map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

export function buildRestriccionFilter(restricciones: LocalRestriccion[]) {
  const productosRestringidos = new Set<string>();
  const seccionesRestringidas = new Set<string>();

  for (const r of restricciones) {
    if (!isActiveNow(r)) continue;
    if (r.producto_id) productosRestringidos.add(r.producto_id);
    if (r.seccion) seccionesRestringidas.add(r.seccion);
  }

  return {
    isProductoAllowed: (id: string) => !productosRestringidos.has(id),
    isSeccionAllowed: (seccion: string) => !seccionesRestringidas.has(seccion),
  };
}
