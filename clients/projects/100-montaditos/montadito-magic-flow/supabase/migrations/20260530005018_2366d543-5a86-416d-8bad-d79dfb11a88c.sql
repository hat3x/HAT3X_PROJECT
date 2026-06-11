
-- Marcar bebidas alcohólicas
UPDATE public.menu_productos
SET contiene_alcohol = true
WHERE (
  nombre ILIKE '%cerveza%'
  OR nombre ILIKE '%cruzcampo%'
  OR nombre ILIKE '%heineken%'
  OR nombre ILIKE '%paulaner%'
  OR nombre ILIKE '%desperados%'
  OR nombre ILIKE '%el águila%'
  OR nombre ILIKE '%el aguila%'
  OR nombre ILIKE '%radler%'
  OR nombre ILIKE '%jarra%'
  OR nombre ILIKE '%vino%'
  OR nombre ILIKE '%ribera%'
  OR nombre ILIKE '%rioja%'
  OR nombre ILIKE '%verdejo%'
  OR nombre ILIKE '%rosado%'
  OR nombre ILIKE '%tinto%'
  OR nombre ILIKE '%blanco%'
  OR nombre ILIKE '%ron %'
  OR nombre ILIKE '%havana%'
  OR nombre ILIKE '%bacardi%'
  OR nombre ILIKE '%vodka%'
  OR nombre ILIKE '%absolut%'
  OR nombre ILIKE '%whisky%'
  OR nombre ILIKE '%ballantines%'
  OR nombre ILIKE '%jack %'
  OR nombre ILIKE '%ginebra%'
  OR nombre ILIKE '%beefeater%'
  OR nombre ILIKE '%spritz%'
  OR nombre ILIKE '%petroni%'
  OR nombre ILIKE '%ladrón%'
  OR nombre ILIKE '%ladron%'
  OR nombre ILIKE '%sancho%'
  OR nombre ILIKE '%quijote%'
  OR nombre ILIKE '%sidra%'
  OR nombre ILIKE '%manzana%'
  OR nombre ILIKE '%crema ruavieja%'
  OR nombre ILIKE '%ruavieja%'
);

-- Desmarcar versiones sin alcohol (0.0)
UPDATE public.menu_productos
SET contiene_alcohol = false
WHERE nombre ILIKE '%0,0%'
   OR nombre ILIKE '%0.0%'
   OR nombre ILIKE '%sin alcohol%';
