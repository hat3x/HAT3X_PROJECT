-- Activa el batido de chocolate si estaba desactivado en la carta global.
UPDATE public.menu_productos
SET disponible = true
WHERE (nombre ILIKE '%batido%chocolate%' OR nombre ILIKE '%chocolate%batido%')
  AND disponible = false;
