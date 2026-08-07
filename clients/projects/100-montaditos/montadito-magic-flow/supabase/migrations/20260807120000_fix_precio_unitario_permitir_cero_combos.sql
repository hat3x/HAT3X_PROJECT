-- ───────────────────────────────────────────────────────────────────────────
-- FIX (CRÍTICO): no se puede crear ningún pedido con combo/promo.
--
-- Los combos y promos (Desayuno Clásico/Dulce, promos 5€, nachos) insertan una
-- línea interna de COCINA a 0 € — la comida ya cobrada en la línea principal del
-- combo. El CHECK `items_precio_unitario_positive` (precio_unitario > 0) la
-- rechazaba y, al ser el insert de pedido_items atómico, abortaba TODO el pedido:
--   ERROR 23514 «new row for relation "pedido_items" violates check constraint
--   "items_precio_unitario_positive"» → "Error al crear el pedido".
--
-- La protección anti-manipulación de precios NO depende de este CHECK: la
-- garantiza el trigger enforce_precio_unitario (20260620120000), que fuerza
-- precio_unitario := menu_productos.precio (o GREATEST(cliente, base) con
-- variante), es decir siempre >= precio de catálogo. El único precio_unitario = 0
-- posible es el de un producto interno cuyo precio de catálogo ES 0 (líneas de
-- ruteo a cocina ya pagadas en otra línea). Además create-payment-intent aborta
-- si el total recalculado es <= 0, así que un pedido entero a 0 sigue siendo
-- imposible.
--
-- Solución: permitir el 0 legítimo relajando el CHECK a `>= 0`.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pedido_items
  DROP CONSTRAINT IF EXISTS items_precio_unitario_positive;

ALTER TABLE public.pedido_items
  ADD CONSTRAINT items_precio_unitario_nonnegative CHECK (precio_unitario >= 0);
