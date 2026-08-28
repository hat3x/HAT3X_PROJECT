-- ───────────────────────────────────────────────────────────────────────────
-- Agrupación de combos en Caja/Cocina + nombre correcto del Desayuno Dulce.
--
-- 1) combo_grupo: enlaza las 2 (o más) líneas de un mismo combo — la línea
--    principal (a barra/caja) y la línea interna de comida (a cocina, 0€) — para
--    que Caja/Histórico las muestren AGRUPADAS como un único ticket, SIN romper
--    el ruteo por destino (la comida sigue yendo a cocina y el café/zumo a barra;
--    cada estación filtra por su `destino`). Es texto libre = id de la línea de
--    carrito; null en productos normales (no-combo). Nullable y aditivo: no
--    afecta a pedidos ya existentes.
--
-- 2) La fila interna del Desayuno Dulce (id …0011) conservaba el nombre ANTIGUO
--    "Desayuno MontyGourmet" (nunca se renombró tras el cambio de carta jul-2026).
--    Caja/Cocina leen menu_productos.nombre en vivo, así que mostraban el nombre
--    viejo. Cambiar el nombre es seguro: el trigger enforce_precio_unitario usa
--    `precio`, no `nombre`.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS combo_grupo text;

UPDATE public.menu_productos
  SET nombre = 'Desayuno Dulce'
  WHERE id = '5a15e000-0000-4000-8000-000000000011';
