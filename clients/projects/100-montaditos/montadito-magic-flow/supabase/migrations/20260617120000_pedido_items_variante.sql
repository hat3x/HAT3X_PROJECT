-- ───────────────────────────────────────────────────────────────────────────
-- Variante del producto en el ítem del pedido (ej. "Jarra Quijote" / "Jarra
-- Sancho", "Boquerón" / "Anchoa", "BBQ" / "Brava", etc.)
--
-- Hasta ahora pedido_items solo guardaba producto_id, así que el dashboard
-- mostraba el nombre base y se perdía el tamaño/variante elegido por el cliente.
-- Añadimos una columna de texto libre para conservar esa elección.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS variante text;
