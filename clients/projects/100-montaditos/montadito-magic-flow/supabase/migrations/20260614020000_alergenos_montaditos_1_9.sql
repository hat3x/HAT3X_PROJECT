-- =============================================================================
-- FIX: Alérgenos montaditos 01–09
-- La migración 20260613020000 usaba numero = '01'..'09' (con cero),
-- pero la BD almacena numero = '1'..'9' (sin cero), por lo que el INSERT
-- no hizo match en esos productos. Se repite usando numero::integer = N.
-- Fuente: PDF 100M_Alergenos_MARZO_2026.pdf
-- =============================================================================

-- 1. Limpiar posibles entradas huérfanas de 1-9 (idempotente)
DELETE FROM producto_alergenos
WHERE producto_id IN (
  SELECT id FROM menu_productos
  WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
    AND disponible = true
    AND numero ~ '^\d+$'
    AND numero::integer BETWEEN 1 AND 9
);

-- 01  Jamón Gran Reserva y aceite de oliva — gluten
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 1
  AND a.codigo IN ('gluten')
ON CONFLICT DO NOTHING;

-- 02  Tortilla de patatas y tomate — gluten, huevos
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 2
  AND a.codigo IN ('gluten','huevos')
ON CONFLICT DO NOTHING;

-- 03  Pulled pork BBQ — gluten
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 3
  AND a.codigo IN ('gluten')
ON CONFLICT DO NOTHING;

-- 04  Pollo y salsa alioli — gluten, huevos
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 4
  AND a.codigo IN ('gluten','huevos')
ON CONFLICT DO NOTHING;

-- 05  Carrillera al vino tinto — gluten, lacteos, sulfitos
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 5
  AND a.codigo IN ('gluten','lacteos','sulfitos')
ON CONFLICT DO NOTHING;

-- 06  Calamarcitos y mayonesa — gluten, huevos, moluscos
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 6
  AND a.codigo IN ('gluten','huevos','moluscos')
ON CONFLICT DO NOTHING;

-- 07  Pollo kebab y salsa BBQ — gluten, apio
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 7
  AND a.codigo IN ('gluten','apio')
ON CONFLICT DO NOTHING;

-- 08  Bacon ahumado y queso madurado — gluten, lacteos
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 8
  AND a.codigo IN ('gluten','lacteos')
ON CONFLICT DO NOTHING;

-- 09  Torreznos y salsa brava — gluten
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id FROM menu_productos p CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true AND p.numero ~ '^\d+$' AND p.numero::integer = 9
  AND a.codigo IN ('gluten')
ON CONFLICT DO NOTHING;
