-- Corrección de precios puntuales — Junio 2026
--   Agua mineral: 2.20 €  (antes 2.00 €)
--   Infusiones:   1.30 €  (confirmación, sin cambio)

-- Agua
UPDATE public.menu_productos
SET precio = 2.20
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%agua%';

-- Infusiones (manzanilla, tila, poleo…)
UPDATE public.menu_productos
SET precio = 1.30
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (
    nombre ILIKE '%infusi%'
    OR nombre ILIKE '%manzanilla%'
    OR nombre ILIKE '%tila%'
    OR nombre ILIKE '%poleo%'
  );
