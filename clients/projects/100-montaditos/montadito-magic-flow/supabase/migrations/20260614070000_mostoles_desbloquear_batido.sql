-- El producto se llama "Batido" (sin especificar sabor).
-- La restricción anterior lo bloqueó porque no contiene "chocolate" en el nombre.
-- Se elimina esa entrada para que el Batido vuelva a ser visible en Mostoles.

DELETE FROM public.local_restricciones
WHERE local_id = (SELECT id FROM public.locales WHERE slug = 'mostoles-constitucion')
  AND producto_id IN (
    SELECT id FROM public.menu_productos
    WHERE nombre ILIKE '%batido%'
  );
