ALTER TABLE public.menu_productos ADD COLUMN IF NOT EXISTS contiene_alcohol boolean NOT NULL DEFAULT false;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS edad_verificada_cliente boolean NOT NULL DEFAULT false;

UPDATE public.menu_productos mp
SET contiene_alcohol = true
FROM public.menu_categorias mc
WHERE mp.categoria_id = mc.id
  AND mc.nombre = 'Bebidas'
  AND (
    mp.nombre ILIKE '%cerveza%' OR
    mp.nombre ILIKE '%mahou%' OR
    mp.nombre ILIKE '%estrella%' OR
    mp.nombre ILIKE '%alhambra%' OR
    mp.nombre ILIKE '%heineken%' OR
    mp.nombre ILIKE '%vino%' OR
    mp.nombre ILIKE '%tinto%' OR
    mp.nombre ILIKE '%blanco%' OR
    mp.nombre ILIKE '%rosado%' OR
    mp.nombre ILIKE '%rioja%' OR
    mp.nombre ILIKE '%ribera%' OR
    mp.nombre ILIKE '%verdejo%' OR
    mp.nombre ILIKE '%albariño%' OR
    mp.nombre ILIKE '%sangría%' OR
    mp.nombre ILIKE '%sangria%' OR
    mp.nombre ILIKE '%tinto de verano%' OR
    mp.nombre ILIKE '%calimocho%' OR
    mp.nombre ILIKE '%clara%' OR
    mp.nombre ILIKE '%cava%' OR
    mp.nombre ILIKE '%champ%' OR
    mp.nombre ILIKE '%sidra%' OR
    mp.nombre ILIKE '%vermut%' OR
    mp.nombre ILIKE '%vermouth%' OR
    mp.nombre ILIKE '%whisky%' OR
    mp.nombre ILIKE '%whiskey%' OR
    mp.nombre ILIKE '%ron %' OR mp.nombre ILIKE 'ron' OR mp.nombre ILIKE 'ron-%' OR
    mp.nombre ILIKE '%ginebra%' OR
    mp.nombre ILIKE '%gin tonic%' OR
    mp.nombre ILIKE '%vodka%' OR
    mp.nombre ILIKE '%tequila%' OR
    mp.nombre ILIKE '%licor%' OR
    mp.nombre ILIKE '%orujo%' OR
    mp.nombre ILIKE '%pacharán%' OR
    mp.nombre ILIKE '%pacharan%'
  );