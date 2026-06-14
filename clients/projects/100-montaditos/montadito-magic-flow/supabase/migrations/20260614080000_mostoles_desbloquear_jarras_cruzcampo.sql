-- La restricción "tercios Cruzcampo" de la migración 040000 bloqueó también
-- las Jarras Cruzcampo (Especial y Radler), que SÍ deben estar disponibles.
-- Se eliminan solo las restricciones de productos Cruzcampo que son jarras.

DELETE FROM public.local_restricciones
WHERE local_id = (SELECT id FROM public.locales WHERE slug = 'mostoles-constitucion')
  AND producto_id IN (
    SELECT id FROM public.menu_productos
    WHERE nombre ILIKE '%cruzcampo%'
      AND (
           nombre ILIKE '%jarra%'
        OR nombre ILIKE '%especial%'
        OR nombre ILIKE '%radler%'
      )
  );
