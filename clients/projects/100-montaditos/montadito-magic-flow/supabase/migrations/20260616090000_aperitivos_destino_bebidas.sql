-- ───────────────────────────────────────────────────────────────────────────
-- FIX: aperitivos servidos en barra (aceitunas, gilda, cucurucho) deben ir a la
-- pista de "bebidas" (barra/caja), NO a cocina.
--
-- Causa raíz: resolve_pedido_item_destino() solo mandaba a 'bebidas' la categoría
-- 'Bebidas'. Los aperitivos están en la categoría 'Aperitivos', así que caían en
-- el ELSE → 'cocina'. Además el trigger set_pedido_item_destino_before_write pisa
-- el destino que envía el cliente con el resultado de esta función, por lo que
-- daba igual lo que mandara la app: el aperitivo siempre acababa en cocina.
--
-- Solución: añadir el reconocimiento de aperitivos por nombre en la función.
-- El trigger sync_pedido_sections (ya existente) recalcula estado_cocina /
-- estado_bebidas / tipo a partir del destino, así que el resto del flujo se
-- ajusta solo. No hace falta tocar nada más.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_pedido_item_destino(_producto_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN mc.nombre = 'Bebidas' THEN 'bebidas'
    -- Aperitivos servidos en barra: se entregan en caja, igual que las bebidas.
    WHEN lower(mp.nombre) LIKE '%aceituna%'
      OR lower(mp.nombre) LIKE '%gilda%'
      OR lower(mp.nombre) LIKE '%cucurucho%' THEN 'bebidas'
    ELSE 'cocina'
  END
  FROM public.menu_productos mp
  LEFT JOIN public.menu_categorias mc ON mc.id = mp.categoria_id
  WHERE mp.id = _producto_id
$$;
