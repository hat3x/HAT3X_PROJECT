-- =============================================================================
-- MIGRACIÓN: Alérgenos oficiales
-- Fuente: PDF 100M_Alergenos_MARZO_2026.pdf
-- Reemplaza: 20260612000000_alergenos_menu_activo.sql (datos inferidos)
-- Solo alérgenos confirmados (X). Trazas (*) excluidas.
-- Reglamento UE 1169/2011 — 14 alérgenos de declaración obligatoria
-- =============================================================================


-- 1. Limpiar entradas existentes para las 5 categorías gestionadas
DELETE FROM producto_alergenos
WHERE producto_id IN (
  SELECT id FROM menu_productos
  WHERE categoria_id IN (
    'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9',  -- Montaditos
    '2a9b31b6-8752-4bbd-8950-3219458f7fa9',  -- Bebidas
    '32447a0c-6911-4c3f-98d8-88a58d3e15ca',  -- Aperitivos
    '1b1a043f-3ff3-4cdf-ad9f-3a2bab122ccf',  -- Raciones
    '4170d84e-abbd-4310-a387-f6171017828a'   -- Ensaladas
  )
  AND disponible = true
);


-- =============================================================================
-- 2. MONTADITOS (01–100)
--    Estrategia: SELECT por numero+codigo evita hardcodear 100 UUIDs.
--    Salsa 100M contiene: huevos(X) + soja(X) + mostaza(X) — confirmado en #10 y #39.
--    Carrillera al vino tinto contiene: lacteos(X) + sulfitos(X) — confirmado en #05.
-- =============================================================================
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true
  AND (p.numero, a.codigo) IN (

    -- ── DE LA CASA (01–10) ──────────────────────────────────────────────────
    -- 01  Jamón Gran Reserva y aceite de oliva
    ('01','gluten'),
    -- 02  Tortilla de patatas y tomate
    ('02','gluten'), ('02','huevos'),
    -- 03  Pulled pork BBQ  [soja de pulled pork es trazas *]
    ('03','gluten'),
    -- 04  Pollo y salsa alioli
    ('04','gluten'), ('04','huevos'),
    -- 05  Carrillera al vino tinto
    ('05','gluten'), ('05','lacteos'), ('05','sulfitos'),
    -- 06  Calamarcitos y mayonesa
    ('06','gluten'), ('06','huevos'), ('06','moluscos'),
    -- 07  Pollo kebab y salsa BBQ  [soja no confirmada en PDF; solo gluten+apio]
    ('07','gluten'), ('07','apio'),
    -- 08  Bacon ahumado y queso madurado
    ('08','gluten'), ('08','lacteos'),
    -- 09  Torreznos y salsa brava
    ('09','gluten'),
    -- 10  Lomo al ajillo y salsa 100M
    ('10','gluten'), ('10','huevos'), ('10','soja'), ('10','mostaza'),

    -- ── CLÁSICOS (11–26) ────────────────────────────────────────────────────
    ('11','gluten'), ('11','huevos'), ('11','lacteos'),
    ('12','gluten'), ('12','huevos'),
    ('13','gluten'), ('13','huevos'),
    ('14','gluten'), ('14','huevos'),
    -- 15 tiene salsa 100M
    ('15','gluten'), ('15','huevos'), ('15','soja'), ('15','mostaza'),
    -- 16 tiene salsa BBQ → apio
    ('16','gluten'), ('16','huevos'), ('16','apio'),
    ('17','gluten'), ('17','lacteos'),
    ('18','gluten'),
    ('19','gluten'), ('19','mostaza'),
    ('20','gluten'), ('20','huevos'),
    -- 21 tiene salsa BBQ → apio
    ('21','gluten'), ('21','apio'),
    -- 22 kebab+tomate sin BBQ ni salsa100M
    ('22','gluten'),
    ('23','gluten'), ('23','lacteos'),
    -- 24 tiene salsa 100M
    ('24','gluten'), ('24','huevos'), ('24','soja'), ('24','mostaza'),
    -- 25 tiene salsa BBQ → apio
    ('25','gluten'), ('25','apio'),
    ('26','gluten'), ('26','huevos'),

    -- ── IMPRESCINDIBLES (27–47) ─────────────────────────────────────────────
    ('27','gluten'), ('27','lacteos'),
    ('28','gluten'),
    ('29','gluten'),
    ('30','gluten'),
    ('31','gluten'),
    ('32','gluten'), ('32','lacteos'),
    ('33','gluten'), ('33','lacteos'),
    ('34','gluten'),
    ('35','gluten'),
    ('36','gluten'), ('36','huevos'),
    ('37','gluten'), ('37','huevos'),
    ('38','gluten'), ('38','huevos'), ('38','moluscos'),
    -- 39  Calamarcitos y salsa 100M [corrección PDF: añadir huevos+soja+mostaza]
    ('39','gluten'), ('39','huevos'), ('39','moluscos'), ('39','soja'), ('39','mostaza'),
    ('40','gluten'), ('40','moluscos'),
    ('41','gluten'), ('41','huevos'), ('41','moluscos'),
    ('42','gluten'), ('42','huevos'), ('42','moluscos'),
    ('43','gluten'), ('43','huevos'),
    -- 44 tiene salsa 100M
    ('44','gluten'), ('44','huevos'), ('44','soja'), ('44','mostaza'),
    ('45','gluten'), ('45','lacteos'),
    ('46','gluten'), ('46','huevos'),
    ('47','gluten'), ('47','lacteos'),

    -- ── ESPECIALES (48–67) ──────────────────────────────────────────────────
    ('48','gluten'), ('48','lacteos'),
    ('49','gluten'),
    ('50','gluten'),
    ('51','gluten'), ('51','huevos'),
    ('52','gluten'), ('52','huevos'), ('52','lacteos'), ('52','sulfitos'),
    ('53','gluten'), ('53','lacteos'), ('53','sulfitos'),
    ('54','gluten'), ('54','lacteos'), ('54','sulfitos'),
    ('55','gluten'), ('55','lacteos'), ('55','sulfitos'),
    ('56','gluten'), ('56','lacteos'), ('56','sulfitos'),
    ('57','gluten'), ('57','huevos'),
    ('58','gluten'), ('58','huevos'),
    -- 59 tiene salsa 100M
    ('59','gluten'), ('59','huevos'), ('59','soja'), ('59','mostaza'),
    ('60','gluten'), ('60','pescado'), ('60','lacteos'),
    ('61','gluten'), ('61','pescado'),
    ('62','gluten'), ('62','pescado'), ('62','mostaza'),
    ('63','gluten'), ('63','pescado'),
    ('64','gluten'),
    ('65','gluten'), ('65','lacteos'),
    -- 66 tiene salsa BBQ → apio
    ('66','gluten'), ('66','apio'),
    ('67','gluten'),

    -- ── MONTYCOOKIE (68–70) ─────────────────────────────────────────────────
    ('68','gluten'), ('68','huevos'), ('68','lacteos'), ('68','sesamo'),
    -- 69: pistacho → frutas_cascara; sésamo no confirmado en PDF
    ('69','gluten'), ('69','huevos'), ('69','lacteos'), ('69','frutas_cascara'),
    -- 70: sésamo es trazas (*) en PDF
    ('70','gluten'), ('70','huevos'), ('70','lacteos'),

    -- ── MONTYDINAS (71–75) — piadina (trigo+avena) ──────────────────────────
    -- soja de pepperoni es trazas (*)
    ('71','gluten'), ('71','lacteos'),
    ('72','gluten'), ('72','lacteos'),
    ('73','gluten'), ('73','lacteos'),
    ('74','gluten'), ('74','lacteos'),
    ('75','gluten'), ('75','lacteos'),

    -- ── MONTYPERROS (76–80) — brioche con sésamo ────────────────────────────
    -- huevos del brioche es trazas (*); sésamo y soja de salchicha confirmados
    ('76','gluten'), ('76','sesamo'), ('76','soja'),
    ('77','gluten'), ('77','sesamo'), ('77','soja'),
    ('78','gluten'), ('78','sesamo'), ('78','soja'), ('78','lacteos'),
    ('79','gluten'), ('79','sesamo'), ('79','soja'),
    -- 80 tiene salsa 100M
    ('80','gluten'), ('80','sesamo'), ('80','soja'), ('80','huevos'), ('80','mostaza'),

    -- ── MONTYBURGERS (81–85) — pan mini burger ──────────────────────────────
    -- huevos y sésamo son trazas (*) en PDF; solo lacteos confirmado donde hay queso
    ('81','gluten'), ('81','lacteos'),
    ('82','gluten'), ('82','lacteos'),
    ('83','gluten'),
    ('84','gluten'), ('84','lacteos'),
    ('85','gluten'), ('85','lacteos'),

    -- ── MONTYPIZZAS (86–90) ─────────────────────────────────────────────────
    -- soja de pulled pork/pepperoni es trazas (*)
    ('86','gluten'), ('86','lacteos'),
    ('87','gluten'), ('87','lacteos'),
    ('88','gluten'), ('88','lacteos'),
    ('89','gluten'), ('89','lacteos'),
    ('90','gluten'), ('90','lacteos'),

    -- ── MONTYGOURMETS (91–100) — pan gourmet con huevos ─────────────────────
    -- Pan gourmet confirma huevos(X) en todos
    ('91','gluten'), ('91','huevos'),
    ('92','gluten'), ('92','pescado'), ('92','huevos'),
    ('93','gluten'), ('93','pescado'), ('93','huevos'),
    ('94','gluten'), ('94','pescado'), ('94','huevos'),
    ('95','gluten'), ('95','pescado'), ('95','huevos'),
    -- 96 y 100: huevos añadidos por pan gourmet (no estaban en migración anterior)
    ('96','gluten'), ('96','huevos'), ('96','lacteos'),
    ('97','gluten'), ('97','huevos'), ('97','lacteos'),
    ('98','gluten'), ('98','pescado'), ('98','huevos'),
    ('99','gluten'), ('99','pescado'), ('99','huevos'),
    ('100','gluten'), ('100','huevos'), ('100','lacteos')
  )
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 3. BEBIDAS
--    Sin cambios respecto a la migración anterior.
--    Destilados exentos por Regl. UE 1169/2011 Anexo II nota 8.
-- =============================================================================
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN alergenos a
WHERE p.categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND p.disponible = true
  AND (p.numero, a.codigo) IN (
    ('B19','sulfitos'),   -- Petroni Spritz
    ('B20','lacteos'),    -- Crema Ruavieja
    ('B21','gluten'),     -- Jarra Cruzcampo Especial
    ('B22','sulfitos'),   -- Jarra Ladrón de Verano
    ('B23','gluten'),     -- Jarra Cruzcampo Radler
    ('B24','sulfitos'),   -- Jarra Ladrón de Manzanas
    ('B25','gluten'),     -- Jarra Heineken
    ('B26','gluten'),     -- Jarra El Águila Dorada
    ('B28','gluten'),     -- Heineken 0.0
    ('B29','gluten'),     -- Desperados
    ('B30','gluten'),     -- Paulaner
    ('B31','sulfitos'),   -- Buenos Días Ribera de Duero
    ('B32','sulfitos'),   -- Cune Rosado Navarra
    ('B33','sulfitos'),   -- Cune Blanco Verdejo
    ('B34','sulfitos'),   -- Cune Tinto Crianza Rioja
    ('B36','lacteos'),    -- Café con Ruavieja
    ('B39','lacteos')     -- Batido
  )
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 4. APERITIVOS
--    Correcciones respecto a migración anterior:
--    - Patatas fritas 4 salsas: se añade gluten(X) confirmado en PDF
--    - Palomitas de pollo: se elimina huevos (era trazas *)
--    - Palomitas de queso gouda: se elimina huevos (era trazas *)
--    - Nachos con bacon: se añade sulfitos(X) confirmado en PDF
--    - Aceitunas manzanilla: cubierta por patrón ILIKE '%aceituna%'
-- =============================================================================

-- Gluten
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'gluten') a
WHERE p.id IN (
  '9ab4f327-1535-4103-b292-2068d18d3d50',  -- Patatas fritas 4 salsas
  'fb40b377-e42f-4d3d-b347-4dcb1cf8ddcd',  -- Palomitas de pollo
  '17dc39bf-d4ba-4728-91eb-f7c4cba31442',  -- Palomitas de queso gouda
  'a83faca2-9849-4c16-a1ea-f682fd51b923',  -- Salchichas 4 salsas
  '0aa86602-8494-437b-9e60-5f95d71d8900'   -- Cheesy Cheetos Bites
)
ON CONFLICT DO NOTHING;

-- Huevos (solo productos con huevos confirmados X, no trazas)
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'huevos') a
WHERE p.id IN (
  '9ab4f327-1535-4103-b292-2068d18d3d50',  -- Patatas fritas 4 salsas
  'a83faca2-9849-4c16-a1ea-f682fd51b923'   -- Salchichas 4 salsas
)
ON CONFLICT DO NOTHING;

-- Lácteos — productos con UUID conocido
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'lacteos') a
WHERE p.id IN (
  '3ca1c5df-1578-419d-920d-25ba5012e8b6',  -- Patatas fritas cheddar y bacon
  '17dc39bf-d4ba-4728-91eb-f7c4cba31442',  -- Palomitas de queso gouda
  '0aa86602-8494-437b-9e60-5f95d71d8900'   -- Cheesy Cheetos Bites
)
ON CONFLICT DO NOTHING;

-- Lácteos — nachos (ambas variantes: cheddar+bacon y cheddar+guacamole)
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'lacteos') a
WHERE p.categoria_id = '32447a0c-6911-4c3f-98d8-88a58d3e15ca'
  AND p.nombre ILIKE '%nachos%'
  AND p.disponible = true
ON CONFLICT DO NOTHING;

-- Sulfitos — patatas fritas cheddar y bacon
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'sulfitos') a
WHERE p.id = '3ca1c5df-1578-419d-920d-25ba5012e8b6'
ON CONFLICT DO NOTHING;

-- Sulfitos — nachos con bacon (confirmado en PDF)
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'sulfitos') a
WHERE p.categoria_id = '32447a0c-6911-4c3f-98d8-88a58d3e15ca'
  AND p.nombre ILIKE '%nachos%'
  AND p.nombre ILIKE '%bacon%'
  AND p.disponible = true
ON CONFLICT DO NOTHING;

-- Sulfitos — aceitunas (de la abuela + manzanilla)
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'sulfitos') a
WHERE p.categoria_id = '32447a0c-6911-4c3f-98d8-88a58d3e15ca'
  AND p.nombre ILIKE '%aceituna%'
  AND p.disponible = true
ON CONFLICT DO NOTHING;

-- Soja
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'soja') a
WHERE p.id = 'a83faca2-9849-4c16-a1ea-f682fd51b923'  -- Salchichas 4 salsas
ON CONFLICT DO NOTHING;

-- Pescado — gildas (boquerón y anchoa)
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'pescado') a
WHERE p.categoria_id = '32447a0c-6911-4c3f-98d8-88a58d3e15ca'
  AND p.nombre ILIKE '%gilda%'
  AND p.disponible = true
ON CONFLICT DO NOTHING;

-- Cucurucho de patatas chips → sin alérgenos confirmados


-- =============================================================================
-- 5. RACIONES
--    Correcciones respecto a migración anterior:
--    - Croquetas de Jamón: se elimina huevos (trazas * en PDF)
--    - Alitas de pollo BBQ: se elimina huevos, se añade apio
--    - Patatas fritas Bravioli: se elimina huevos (trazas * en PDF)
--    - Tiras de pollo: se elimina huevos (no confirmado en PDF)
--    - Torreznos: sin alérgenos confirmados (igual que antes)
-- =============================================================================

-- Gluten
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'gluten') a
WHERE p.id IN (
  '3795cecd-4939-49fa-99a5-46b3acf1cb42',  -- Croquetas de Jamón
  'f105cb80-8834-4b88-b8bd-a13e0fcba607',  -- Croquetas de Mac&Cheese
  '2c747f14-7fad-440b-8947-7c913fbfc644',  -- Alitas de pollo
  'a40bd701-89cc-4457-9a6b-f179eeb6ad20'   -- Tiras de pollo
)
ON CONFLICT DO NOTHING;

-- Lácteos
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'lacteos') a
WHERE p.id IN (
  '3795cecd-4939-49fa-99a5-46b3acf1cb42',  -- Croquetas de Jamón
  'f105cb80-8834-4b88-b8bd-a13e0fcba607'   -- Croquetas de Mac&Cheese
)
ON CONFLICT DO NOTHING;

-- Apio — alitas de pollo sabor BBQ
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN (SELECT id FROM alergenos WHERE codigo = 'apio') a
WHERE p.id = '2c747f14-7fad-440b-8947-7c913fbfc644'
ON CONFLICT DO NOTHING;

-- Patatas fritas Bravioli (52f15185): huevos son trazas (*) → sin alérgenos confirmados
-- Torreznos: sin alérgenos confirmados en PDF


-- =============================================================================
-- 6. ENSALADAS
--    Correcciones respecto a migración anterior:
--    - TexMex: se eliminan soja y apio (trazas * en PDF); solo gluten+mostaza
--    - Campera: se elimina sulfitos (trazas * en PDF); solo gluten+huevos+lacteos
-- =============================================================================

-- TexMex
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN alergenos a
WHERE p.id = 'bd45575b-709f-4f36-9e97-00c313cdb71f'
  AND a.codigo IN ('gluten', 'mostaza')
ON CONFLICT DO NOTHING;

-- Campera
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN alergenos a
WHERE p.id = '3d61ba4a-c009-4d0c-bd74-aa20ea5720e4'
  AND a.codigo IN ('gluten', 'huevos', 'lacteos')
ON CONFLICT DO NOTHING;
