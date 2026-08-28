-- ───────────────────────────────────────────────────────────────────────────
-- FIX (CRÍTICO): los combos con bebida enviaban su café/zumo a COCINA en vez de
-- a barra/caja. En un Desayuno la cocina veía 4 líneas (2 desayunos) y los cafés
-- y zumos no se quedaban en caja.
--
-- Causa: el trigger set_pedido_item_destino PISABA el `destino` que envía la app
-- con resolve_pedido_item_destino(producto_id), que solo devuelve 'bebidas' si la
-- CATEGORÍA del producto es 'Bebidas' (o el nombre es aperitivo de barra). El
-- producto interno de un combo (Desayuno Clásico/Dulce, combos 5€, Salséo) NO está
-- en la categoría 'Bebidas', así que TODA la línea principal (café + zumo incluidos)
-- se forzaba a 'cocina'. Afecta a todos los combos/promos con parte de barra.
--
-- La app YA calcula el destino correcto POR LÍNEA (item.destino: 'bebidas' para la
-- línea de barra del combo, 'cocina' para la comida). Solución: RESPETAR el destino
-- que envía la app y usar la resolución por categoría solo como FALLBACK cuando la
-- app no manda destino. `destino` no es sensible (solo enruta a una estación:
-- cocina vs barra/caja), y el único que inserta pedido_items es la app cliente,
-- cuyo lineDestino ya es correcto (bebidas por categoría/aperitivo, cocina el resto,
-- y el override explícito de los combos).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_pedido_item_destino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Respeta el destino enviado por la app; si viene NULL, lo resuelve por categoría.
  NEW.destino := COALESCE(NEW.destino, public.resolve_pedido_item_destino(NEW.producto_id), 'cocina');
  RETURN NEW;
END;
$$;
