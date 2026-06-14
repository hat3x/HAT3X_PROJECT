-- Corrección de precios de jarras — Junio 2026
--
-- Lógica de precios (precio = Quijote; Sancho = precio + 0.50€):
--   Cerveza Premium  → Quijote 2.00 € / Sancho 2.50 €  → precio = 2.00
--   Jarras Heladas   → Quijote 1.50 € / Sancho 2.00 €  → precio = 1.50

-- Cerveza Premium: precio base = 2.00 €
UPDATE public.menu_productos
SET precio = 2.00
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND seccion = 'Cerveza Premium';

-- Jarras Heladas: precio base = 1.50 € (Quijote)
UPDATE public.menu_productos
SET precio = 1.50
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND seccion = 'Jarras Heladas';
