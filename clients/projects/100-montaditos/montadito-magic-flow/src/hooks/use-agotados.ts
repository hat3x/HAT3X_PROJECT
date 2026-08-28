import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveLocal } from '@/lib/active-local';

/**
 * Calcula qué productos están AGOTADOS en el local activo:
 *  - por INGREDIENTE/PAN agotado (montaditos/ensaladas que lo contienen)
 *  - por PRODUCTO marcado agotado tal cual (aperitivos/raciones/bebidas/…)
 *
 * Optimización de velocidad:
 *  - El mapa producto→ingrediente apenas cambia → se cachea (10 min).
 *  - El estado de "agotados" es diminuto → se refresca cada 3s + realtime.
 *  Resultado: instantáneo donde el WebSocket conecta (Android/escritorio) y
 *  como mucho 3s donde no (iPhone), en vez de los 20s anteriores.
 */
export function useAgotados() {
  const localId = useActiveLocal((s) => s.local?.id);
  const qc = useQueryClient();

  // Catálogo producto→ingrediente (cambia muy poco)
  const { data: prodIng } = useQuery<{ producto_id: string; ingrediente_id: string }[]>({
    queryKey: ['producto-ingredientes'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('producto_ingredientes' as any)
        .select('producto_id, ingrediente_id');
      return (data ?? []) as any[];
    },
  });

  // Catálogo de ingredientes (id → nombre), para resolver agotados por nombre.
  const { data: catalogo } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['ingredientes-catalogo'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('ingredientes' as any).select('id, nombre');
      return (data ?? []) as any[];
    },
  });

  // Estado de agotados del local (pequeño → refresco rápido)
  const { data: agot } = useQuery<{ ings: Set<string>; prods: Set<string> }>({
    queryKey: ['local-agotados', localId],
    enabled: !!localId,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!localId) return { ings: new Set<string>(), prods: new Set<string>() };
      const [ia, pa] = await Promise.all([
        supabase.from('local_ingredientes_agotados' as any).select('ingrediente_id').eq('local_id', localId),
        supabase.from('local_productos_agotados' as any).select('producto_id').eq('local_id', localId),
      ]);
      return {
        ings: new Set<string>(((ia.data ?? []) as any[]).map((r) => r.ingrediente_id)),
        prods: new Set<string>(((pa.data ?? []) as any[]).map((r) => r.producto_id)),
      };
    },
  });

  // Realtime: si el WebSocket conecta, refresca al instante.
  useEffect(() => {
    if (!localId) return;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const invalidate = () => qc.invalidateQueries({ queryKey: ['local-agotados', localId] });
    try {
      ch = supabase
        .channel(`agotados-${localId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'local_ingredientes_agotados', filter: `local_id=eq.${localId}` }, invalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'local_productos_agotados', filter: `local_id=eq.${localId}` }, invalidate)
        .subscribe();
    } catch {
      /* realtime no disponible: queda el refetchInterval de 3s */
    }
    return () => {
      if (ch) {
        try { supabase.removeChannel(ch); } catch { /* ignore */ }
      }
    };
  }, [localId, qc]);

  const agotados = useMemo(() => {
    const s = new Set<string>();
    const ings = agot?.ings ?? new Set<string>();
    for (const r of prodIng ?? []) {
      if (ings.has(r.ingrediente_id)) s.add(r.producto_id);
    }
    for (const p of agot?.prods ?? new Set<string>()) s.add(p);
    return s;
  }, [prodIng, agot]);

  // Nombres de ingredientes agotados (para variantes: alitas/nachos).
  const agotadoNombres = useMemo(() => {
    const ids = agot?.ings ?? new Set<string>();
    const set = new Set<string>();
    for (const c of catalogo ?? []) {
      if (ids.has(c.id)) set.add(c.nombre);
    }
    return set;
  }, [catalogo, agot]);

  return {
    agotados,
    isProductoAgotado: (productoId: string) => agotados.has(productoId),
    isIngredienteAgotado: (nombre: string) => agotadoNombres.has(nombre),
  };
}
