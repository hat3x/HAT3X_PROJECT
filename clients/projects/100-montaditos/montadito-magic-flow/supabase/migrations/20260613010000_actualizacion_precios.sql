-- =============================================================================
-- ACTUALIZACIÓN DE PRECIOS — Junio 2026
-- =============================================================================
-- Categorías:
--   Montaditos : f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9
--   Bebidas    : 2a9b31b6-8752-4bbd-8950-3219458f7fa9
--   Aperitivos : 32447a0c-6911-4c3f-98d8-88a58d3e15ca
--   Raciones   : 1b1a043f-3ff3-4cdf-ad9f-3a2bab122ccf
--   Ensaladas  : 4170d84e-abbd-4310-a387-f6171017828a
-- =============================================================================


-- ─── 1. MONTADITOS ────────────────────────────────────────────────────────────

-- De la Casa (01-10): 1.10 €
UPDATE public.menu_productos SET precio = 1.10
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 1 AND 10;

-- Clásicos (11-26): 1.40 €
UPDATE public.menu_productos SET precio = 1.40
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 11 AND 26;

-- Imprescindibles (27-47): 1.60 €
UPDATE public.menu_productos SET precio = 1.60
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 27 AND 47;

-- Especiales (48-67): 1.80 €
UPDATE public.menu_productos SET precio = 1.80
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 48 AND 67;

-- MontyCookie (68-70): 1.80 €
UPDATE public.menu_productos SET precio = 1.80
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 68 AND 70;

-- MontyDinas (71-75): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 71 AND 75;

-- MontyPerros (76-80): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 76 AND 80;

-- MontyBurgers (81-85): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 81 AND 85;

-- MontyPizzas (86-90): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 86 AND 90;

-- MontyGourmets (91-100): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND numero ~ '^\d+$' AND numero::integer BETWEEN 91 AND 100;


-- ─── 2. ENSALADAS ─────────────────────────────────────────────────────────────

UPDATE public.menu_productos SET precio = 3.50
WHERE categoria_id = '4170d84e-abbd-4310-a387-f6171017828a';


-- ─── 3. RACIONES ──────────────────────────────────────────────────────────────

UPDATE public.menu_productos SET precio = 7.50
WHERE categoria_id = '1b1a043f-3ff3-4cdf-ad9f-3a2bab122ccf';


-- ─── 4. APERITIVOS ────────────────────────────────────────────────────────────
-- UUIDs de la migración 20260612000000_alergenos_menu_activo.sql.

-- Aceitunas: 1.00 €
UPDATE public.menu_productos SET precio = 1.00
WHERE id = 'f700cf0b-d6a8-4178-9dff-41f34099f0d8';

-- Gildas: 1.50 €
UPDATE public.menu_productos SET precio = 1.50
WHERE id = 'a1923e24-7fe9-4228-9301-facb8e37c9c7';

-- Patatas fritas (cheddar y bacon + 4 salsas): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE id IN (
  '3ca1c5df-1578-419d-920d-25ba5012e8b6',
  '9ab4f327-1535-4103-b292-2068d18d3d50'
);

-- Nachos (ambas variantes por nombre): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = '32447a0c-6911-4c3f-98d8-88a58d3e15ca'
  AND nombre ILIKE '%nachos%';

-- Palomitas de pollo, Palomitas de queso gouda,
-- Salchichas 4 salsas, Cheesy Cheetos Bites: 2.50 €
UPDATE public.menu_productos SET precio = 2.50
WHERE id IN (
  'fb40b377-e42f-4d3d-b347-4dcb1cf8ddcd',
  '17dc39bf-d4ba-4728-91eb-f7c4cba31442',
  'a83faca2-9849-4c16-a1ea-f682fd51b923',
  '0aa86602-8494-437b-9e60-5f95d71d8900'
);


-- ─── 5. BEBIDAS ───────────────────────────────────────────────────────────────
-- Secciones confirmadas por imagen del menú real.
-- Orden de ejecución: de mayor a menor precio para evitar solapamientos.

-- Tardeo Premium — Ron Havana, Beefeater (gin y 0.0), Ballantine's,
--   Vodka Absolut, Petroni Spritz, Crema Ruavieja: 6.00 €
UPDATE public.menu_productos SET precio = 6.00
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (
    nombre ILIKE '%havana%'
    OR nombre ILIKE '%beefeater%'
    OR nombre ILIKE '%ballantine%'
    OR (nombre ILIKE '%absolut%' AND nombre NOT ILIKE '%sprite%')
    OR nombre ILIKE '%petroni%'
    OR (nombre ILIKE '%ruavieja%' AND nombre NOT ILIKE '%café%' AND nombre NOT ILIKE '%cafe%')
  );

-- Tardeo chill — Absolut & Sprite, Bacardi & Coke, Jack & Coke: 3.50 €
UPDATE public.menu_productos SET precio = 3.50
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (
    (nombre ILIKE '%absolut%' AND nombre ILIKE '%sprite%')
    OR nombre ILIKE '%bacardi%'
    OR (nombre ILIKE '%jack%' AND nombre ILIKE '%coke%')
  );

-- Energéticas — Monster (todos los sabores): 3.00 €
UPDATE public.menu_productos SET precio = 3.00
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%monster%';

-- Paulaner (excepción botellín): 3.50 €
UPDATE public.menu_productos SET precio = 3.50
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%paulaner%';

-- Botellines — Cruzcampo, Heineken 0.0, Desperados, El Águila: 2.50 €
-- (se excluyen Jarras y Paulaner)
UPDATE public.menu_productos SET precio = 2.50
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (
    nombre ILIKE '%cruzcampo%'
    OR nombre ILIKE '%heineken%'
    OR nombre ILIKE '%desperados%'
    OR nombre ILIKE '%el águila%'
    OR nombre ILIKE '%el aguila%'
  )
  AND nombre NOT ILIKE '%quijote%'
  AND nombre NOT ILIKE '%sancho%'
  AND nombre NOT ILIKE '%paulaner%';

-- Jarras: lógica por tipo de cerveza + tamaño (Quijote / Sancho).
--
--   HELADAS (Cruzcampo Especial + Ladrón de Verano):
--     Quijote = 1.50 €  |  Sancho = 2.00 €
--
--   PREMIUM (Cruzcampo Radler, Ladrón de Manzanas, Heineken, El Águila):
--     Quijote = 2.00 €  |  Sancho = 2.50 €

-- Jarra Sancho premium (Radler, Ladrón de Manzanas, Heineken, El Águila): 2.50 €
UPDATE public.menu_productos SET precio = 2.50
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%sancho%'
  AND (
    nombre ILIKE '%radler%'
    OR nombre ILIKE '%manzana%'
    OR nombre ILIKE '%heineken%'
    OR nombre ILIKE '%águila%'
    OR nombre ILIKE '%aguila%'
  );

-- Jarra Quijote premium (Radler, Ladrón de Manzanas, Heineken, El Águila): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%quijote%'
  AND (
    nombre ILIKE '%radler%'
    OR nombre ILIKE '%manzana%'
    OR nombre ILIKE '%heineken%'
    OR nombre ILIKE '%águila%'
    OR nombre ILIKE '%aguila%'
  );

-- Jarra Sancho heladas (Cruzcampo Especial + Ladrón de Verano): 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%sancho%'
  AND (
    (nombre ILIKE '%cruzcampo%' AND nombre NOT ILIKE '%radler%')
    OR (nombre ILIKE '%ladrón%' AND nombre NOT ILIKE '%manzana%')
    OR (nombre ILIKE '%ladron%' AND nombre NOT ILIKE '%manzana%')
  );

-- Jarra Quijote heladas (Cruzcampo Especial + Ladrón de Verano): 1.50 €
UPDATE public.menu_productos SET precio = 1.50
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%quijote%'
  AND (
    (nombre ILIKE '%cruzcampo%' AND nombre NOT ILIKE '%radler%')
    OR (nombre ILIKE '%ladrón%' AND nombre NOT ILIKE '%manzana%')
    OR (nombre ILIKE '%ladron%' AND nombre NOT ILIKE '%manzana%')
  );

-- Vinos — Ribera, Rioja, Verdejo, Rosado, Buenos Días: 2.00 €
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (
    nombre ILIKE '%ribera%'
    OR nombre ILIKE '%rioja%'
    OR nombre ILIKE '%verdejo%'
    OR nombre ILIKE '%rosado%'
    OR nombre ILIKE '%buenos días%'
    OR nombre ILIKE '%buenos dias%'
  );

-- Appletiser (acepta ambas grafías): 2.20 €
UPDATE public.menu_productos SET precio = 2.20
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (nombre ILIKE '%appletis%' OR nombre ILIKE '%appletie%');

-- Clásicas — Refrescos (Coca-Cola, Fanta, Sprite, Nestea, etc.) y Agua: 2.00 €
-- Se usa seccion como filtro principal; si no está poblado, se aplica por nombre.
UPDATE public.menu_productos SET precio = 2.00
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (
    seccion ILIKE '%clásic%'
    OR nombre ILIKE '%agua%'
    OR nombre ILIKE '%coca%'
    OR nombre ILIKE '%fanta%'
    OR nombre ILIKE '%sprite%'
    OR nombre ILIKE '%nestea%'
    OR nombre ILIKE '%aquarius%'
    OR nombre ILIKE '%tonica%'
    OR nombre ILIKE '%tónica%'
  )
  AND nombre NOT ILIKE '%appletis%'
  AND nombre NOT ILIKE '%appletie%'
  AND nombre NOT ILIKE '%monster%';

-- Café (excluye combinado con Ruavieja): 1.40 €
UPDATE public.menu_productos SET precio = 1.40
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (nombre ILIKE '%café%' OR nombre ILIKE '%cafe%')
  AND nombre NOT ILIKE '%ruavieja%';

-- Infusiones: 1.30 €
UPDATE public.menu_productos SET precio = 1.30
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND (
    nombre ILIKE '%infusión%'
    OR nombre ILIKE '%manzanilla%'
    OR nombre ILIKE '%tila%'
    OR nombre ILIKE '%poleo%'
  );

-- Zumo: 1.80 €
UPDATE public.menu_productos SET precio = 1.80
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%zumo%';

-- Batido: 1.50 €
UPDATE public.menu_productos SET precio = 1.50
WHERE categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND nombre ILIKE '%batido%';
