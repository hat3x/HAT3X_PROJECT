-- =============================================================================
-- MIGRACIÓN: Alérgenos para todos los productos activos (excepto MontyAhorro)
-- Fecha: 2026-06-12
-- Reglamento UE 1169/2011 — 14 alérgenos de declaración obligatoria
--
-- ⚠️  AVISO LEGAL: Esta información ha sido inferida a partir de los ingredientes
--     visibles en el nombre y descripción de cada producto, y validada contra el
--     histórico de alérgenos del menú anterior (mismo establecimiento).
--     DEBE SER REVISADA Y VALIDADA por el establecimiento antes de publicarse
--     en producción. Los alérgenos de trazas no están incluidos.
--
-- Seguro de re-ejecutar: ON CONFLICT DO NOTHING previene duplicados.
-- =============================================================================


-- =============================================================================
-- 1. MONTADITOS — menú activo numerado 01–100
--    Estrategia: SELECT por numero (evita hardcodear 100 UUIDs).
--    Todos contienen GLUTEN (base de pan de trigo).
--    categoria_id = f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9
-- =============================================================================
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN alergenos a
WHERE p.categoria_id = 'f3b118eb-c117-4a4c-9b61-7d10d9a3ebf9'
  AND p.disponible = true
  AND (p.numero, a.codigo) IN (

    -- ── DE LA CASA (01–10) ───────────────────────────────────────────────────
    -- 01  Jamón Gran Reserva y aceite de oliva
    ('01','gluten'),
    -- 02  Tortilla de patatas y tomate
    ('02','gluten'), ('02','huevos'),
    -- 03  Pulled pork BBQ
    ('03','gluten'),
    -- 04  Pollo y salsa alioli  [alioli → huevos]
    ('04','gluten'), ('04','huevos'),
    -- 05  Carrillera al vino tinto  [vino → sulfitos]
    ('05','gluten'), ('05','sulfitos'),
    -- 06  Calamarcitos y mayonesa  [calamar → moluscos | mayo → huevos]
    ('06','gluten'), ('06','huevos'), ('06','moluscos'),
    -- 07  Pollo kebab y salsa BBQ  [kebab → soja+apio | BBQ → apio]
    ('07','gluten'), ('07','soja'), ('07','apio'),
    -- 08  Bacon ahumado y queso madurado  [queso → lácteos]
    ('08','gluten'), ('08','lacteos'),
    -- 09  Torreznos y salsa brava
    ('09','gluten'),
    -- 10  Lomo al ajillo y salsa 100M
    ('10','gluten'),

    -- ── CLÁSICOS (11–26) ────────────────────────────────────────────────────
    -- 11  Tortilla de patatas y queso madurado
    ('11','gluten'), ('11','huevos'), ('11','lacteos'),
    -- 12  Tortilla de patatas, bacon ahumado y salsa alioli
    ('12','gluten'), ('12','huevos'),
    -- 13  Tortilla de patatas, tomate y mayonesa
    ('13','gluten'), ('13','huevos'),
    -- 14  Tortilla de patatas y mojo picón
    ('14','gluten'), ('14','huevos'),
    -- 15  Tortilla de patatas, patatas paja y salsa 100M
    ('15','gluten'), ('15','huevos'),
    -- 16  Tortilla de patatas, cebolla crujiente y salsa BBQ  [BBQ → apio]
    ('16','gluten'), ('16','huevos'), ('16','apio'),
    -- 17  Pollo y queso madurado
    ('17','gluten'), ('17','lacteos'),
    -- 18  Pollo, tomate y mojo picón
    ('18','gluten'),
    -- 19  Pollo, patatas paja y salsa de mostaza y miel
    ('19','gluten'), ('19','mostaza'),
    -- 20  Pollo, bacon ahumado y mayonesa
    ('20','gluten'), ('20','huevos'),
    -- 21  Pollo, patatas paja y salsa BBQ  [BBQ → apio]
    ('21','gluten'), ('21','apio'),
    -- 22  Pollo kebab y tomate
    ('22','gluten'), ('22','soja'), ('22','apio'),
    -- 23  Pollo kebab y salsa cheddar
    ('23','gluten'), ('23','soja'), ('23','apio'), ('23','lacteos'),
    -- 24  Pollo kebab, tomate y salsa 100M
    ('24','gluten'), ('24','soja'), ('24','apio'),
    -- 25  Pollo kebab, patatas paja y salsa BBQ
    ('25','gluten'), ('25','soja'), ('25','apio'),
    -- 26  Pollo kebab, bacon ahumado y mayonesa
    ('26','gluten'), ('26','soja'), ('26','apio'), ('26','huevos'),

    -- ── IMPRESCINDIBLES (27–47) ─────────────────────────────────────────────
    -- 27  Pulled pork BBQ y salsa cheddar
    ('27','gluten'), ('27','lacteos'),
    -- 28  Pulled pork BBQ y bacon ahumado
    ('28','gluten'),
    -- 29  Pulled pork BBQ y salsa brava
    ('29','gluten'),
    -- 30  Pulled pork BBQ y patatas paja
    ('30','gluten'),
    -- 31  Pulled pork BBQ y cebolla crujiente
    ('31','gluten'),
    -- 32  Lomo al ajillo y queso madurado
    ('32','gluten'), ('32','lacteos'),
    -- 33  Lomo al ajillo y queso gorgonzola
    ('33','gluten'), ('33','lacteos'),
    -- 34  Lomo al ajillo y mojo picón
    ('34','gluten'),
    -- 35  Lomo al ajillo, tomate y patatas paja
    ('35','gluten'),
    -- 36  Lomo al ajillo, tomate y mayonesa
    ('36','gluten'), ('36','huevos'),
    -- 37  Lomo al ajillo, bacon ahumado y salsa alioli
    ('37','gluten'), ('37','huevos'),
    -- 38  Calamarcitos y salsa alioli
    ('38','gluten'), ('38','huevos'), ('38','moluscos'),
    -- 39  Calamarcitos y salsa 100M
    ('39','gluten'), ('39','moluscos'),
    -- 40  Calamarcitos y guacamole
    ('40','gluten'), ('40','moluscos'),
    -- 41  Calamarcitos, salsa brava y mayonesa
    ('41','gluten'), ('41','huevos'), ('41','moluscos'),
    -- 42  Calamarcitos, tomate y mayonesa
    ('42','gluten'), ('42','huevos'), ('42','moluscos'),
    -- 43  Bacon ahumado, tomate y mayonesa
    ('43','gluten'), ('43','huevos'),
    -- 44  Bacon ahumado, cebolla crujiente y salsa 100M
    ('44','gluten'),
    -- 45  Bacon ahumado, tomate y queso gorgonzola
    ('45','gluten'), ('45','lacteos'),
    -- 46  Bacon ahumado, patatas paja y mayonesa
    ('46','gluten'), ('46','huevos'),
    -- 47  Bacon ahumado, tomate y queso madurado
    ('47','gluten'), ('47','lacteos'),

    -- ── ESPECIALES (48–67) ──────────────────────────────────────────────────
    -- 48  Jamón Gran Reserva y mantequilla  [mantequilla → lácteos]
    ('48','gluten'), ('48','lacteos'),
    -- 49  Jamón Gran Reserva y tomate
    ('49','gluten'),
    -- 50  Jamón Gran Reserva, tomate y patatas paja
    ('50','gluten'),
    -- 51  Jamón Gran Reserva y tortilla de patatas
    ('51','gluten'), ('51','huevos'),
    -- 52  Carrillera al vino tinto y salsa alioli
    ('52','gluten'), ('52','huevos'), ('52','sulfitos'),
    -- 53  Carrillera al vino tinto y patatas paja
    ('53','gluten'), ('53','sulfitos'),
    -- 54  Carrillera al vino tinto y tomate
    ('54','gluten'), ('54','sulfitos'),
    -- 55  Carrillera al vino tinto y cebolla crujiente
    ('55','gluten'), ('55','sulfitos'),
    -- 56  Carrillera al vino tinto y bacon ahumado
    ('56','gluten'), ('56','sulfitos'),
    -- 57  Torreznos y mayonesa
    ('57','gluten'), ('57','huevos'),
    -- 58  Torreznos y salsa alioli
    ('58','gluten'), ('58','huevos'),
    -- 59  Torreznos y salsa 100M
    ('59','gluten'),
    -- 60  Salmón ahumado y queso gorgonzola
    ('60','gluten'), ('60','pescado'), ('60','lacteos'),
    -- 61  Salmón ahumado y tomate
    ('61','gluten'), ('61','pescado'),
    -- 62  Salmón ahumado y salsa de mostaza y miel
    ('62','gluten'), ('62','pescado'), ('62','mostaza'),
    -- 63  Salmón ahumado y guacamole
    ('63','gluten'), ('63','pescado'),
    -- 64  Chorizo parrillero y salsa brava
    ('64','gluten'),
    -- 65  Chorizo parrillero y queso gorgonzola
    ('65','gluten'), ('65','lacteos'),
    -- 66  Chorizo parrillero y salsa BBQ  [BBQ → apio]
    ('66','gluten'), ('66','apio'),
    -- 67  Chorizo parrillero y guacamole
    ('67','gluten'),

    -- ── MONTYCOOKIE (68–70) — galleta con chocolate ─────────────────────────
    -- 68  MontyCookie doble chocolate y sirope de caramelo toffee
    ('68','gluten'), ('68','huevos'), ('68','lacteos'), ('68','sesamo'),
    -- 69  MontyCookie chocolate y sirope de pistacho  [pistacho → frutas_cascara]
    ('69','gluten'), ('69','huevos'), ('69','lacteos'), ('69','sesamo'), ('69','frutas_cascara'),
    -- 70  MontyCookie chocolate y sirope de chocolate
    ('70','gluten'), ('70','huevos'), ('70','lacteos'), ('70','sesamo'),

    -- ── MONTYDINAS (71–75) — piadina (pan plano de trigo) ───────────────────
    -- 71  Piadina de jamón cocido y queso mozzarella
    ('71','gluten'), ('71','lacteos'),
    -- 72  Piadina de pepperoni y queso mozzarella
    ('72','gluten'), ('72','lacteos'),
    -- 73  Piadina de pollo, tomate, queso mozzarella y orégano
    ('73','gluten'), ('73','lacteos'),
    -- 74  Piadina de jamón Gran Reserva, queso mozzarella y orégano
    ('74','gluten'), ('74','lacteos'),
    -- 75  Piadina de jamón cocido, queso madurado y tomate
    ('75','gluten'), ('75','lacteos'),

    -- ── MONTYPERROS (76–80) — pan brioche con sésamo ────────────────────────
    -- 76  Hot dog, kétchup y mayonesa  [salchicha → soja | pan → sésamo]
    ('76','gluten'), ('76','soja'), ('76','sesamo'), ('76','huevos'),
    -- 77  Hot dog, cebolla crujiente y mojo picón
    ('77','gluten'), ('77','soja'), ('77','sesamo'),
    -- 78  Hot dog, guacamole y salsa cheddar
    ('78','gluten'), ('78','soja'), ('78','sesamo'), ('78','lacteos'),
    -- 79  Hot dog, patatas paja y salsa alioli
    ('79','gluten'), ('79','soja'), ('79','sesamo'), ('79','huevos'),
    -- 80  Hot dog, cebolla crujiente y salsa 100M
    ('80','gluten'), ('80','soja'), ('80','sesamo'),

    -- ── MONTYBURGERS (81–85) — pan brioche con sésamo ───────────────────────
    -- 81  Burger, queso madurado, tomate y mayonesa
    ('81','gluten'), ('81','huevos'), ('81','lacteos'), ('81','soja'), ('81','sesamo'),
    -- 82  Burger, queso madurado y mojo picón
    ('82','gluten'), ('82','lacteos'), ('82','soja'), ('82','sesamo'),
    -- 83  Burger, guacamole y bacon ahumado
    ('83','gluten'), ('83','soja'), ('83','sesamo'),
    -- 84  Burger, bacon ahumado y salsa cheddar
    ('84','gluten'), ('84','lacteos'), ('84','soja'), ('84','sesamo'),
    -- 85  Burger, queso madurado y pepperoni
    ('85','gluten'), ('85','lacteos'), ('85','soja'), ('85','sesamo'),

    -- ── MONTYPIZZAS (86–90) — base de pan tipo empotraíto ───────────────────
    -- 86  BBQ: bacon ahumado, queso mozzarella, cebolla crujiente y salsa BBQ
    ('86','gluten'), ('86','lacteos'), ('86','soja'), ('86','apio'),
    -- 87  Pollo: pollo kebab, queso mozzarella, salsa pizza y orégano
    ('87','gluten'), ('87','lacteos'), ('87','soja'), ('87','apio'),
    -- 88  3 Quesos: queso madurado, queso mozzarella, queso gorgonzola y orégano
    ('88','gluten'), ('88','lacteos'),
    -- 89  Pulled Pork: pulled pork BBQ, queso mozzarella, cebolla crujiente y salsa BBQ
    ('89','gluten'), ('89','lacteos'), ('89','apio'),
    -- 90  Pepperoni: pepperoni, queso mozzarella, salsa pizza y orégano
    ('90','gluten'), ('90','lacteos'), ('90','soja'),

    -- ── MONTYGOURMET (91–100) — pan especial tipo empotraíto ────────────────
    -- 91  Tortilla de patatas, tomate y mayonesa
    ('91','gluten'), ('91','huevos'),
    -- 92  Salmón ahumado y huevo hilado  [huevo hilado → huevos]
    ('92','gluten'), ('92','pescado'), ('92','huevos'),
    -- 93  Salmón ahumado y pintxo donostiarra  [anchoa → pescado | pintxo → huevos]
    ('93','gluten'), ('93','pescado'), ('93','huevos'),
    -- 94  Pintxo donostiarra y atún  [boquerón/anchoa+atún → pescado]
    ('94','gluten'), ('94','pescado'), ('94','huevos'),
    -- 95  Pintxo donostiarra y huevo hilado
    ('95','gluten'), ('95','pescado'), ('95','huevos'),
    -- 96  Jamón cocido, queso madurado y mantequilla
    ('96','gluten'), ('96','lacteos'),
    -- 97  Jamón cocido, queso madurado, tomate y mayonesa
    ('97','gluten'), ('97','huevos'), ('97','lacteos'),
    -- 98  Atún, tomate y mayonesa
    ('98','gluten'), ('98','pescado'), ('98','huevos'),
    -- 99  Atún, huevo hilado y mayonesa
    ('99','gluten'), ('99','pescado'), ('99','huevos'),
    -- 100 Jamón Gran Reserva y mantequilla
    ('100','gluten'), ('100','lacteos')
  )
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 2. BEBIDAS — con alérgenos declarables
--    Nota: Los destilados (gin, vodka, ron, whisky) están exentos de declarar
--    gluten por Regl. UE 1169/2011 Anexo II, nota 8 (destilación elimina proteínas).
--    Las cervezas SÍ contienen gluten (proceso no destilado).
--    Los vinos contienen sulfitos (>10 mg/L, umbral de declaración).
--    categoria_id = 2a9b31b6-8752-4bbd-8950-3219458f7fa9
-- =============================================================================
INSERT INTO producto_alergenos (producto_id, alergeno_id)
SELECT p.id, a.id
FROM menu_productos p
CROSS JOIN alergenos a
WHERE p.categoria_id = '2a9b31b6-8752-4bbd-8950-3219458f7fa9'
  AND p.disponible = true
  AND (p.numero, a.codigo) IN (
    -- B19 Petroni Spritz  [espumoso base vino → sulfitos]
    ('B19','sulfitos'),
    -- B20 Crema Ruavieja  [crema de licor → lácteos]  — ya en BD, ON CONFLICT seguro
    ('B20','lacteos'),
    -- B21 Jarra Cruzcampo Especial  [cerveza malta cebada → gluten]
    ('B21','gluten'),
    -- B22 Jarra Ladrón de Verano  [base vino → sulfitos]
    ('B22','sulfitos'),
    -- B23 Jarra Cruzcampo Radler  [cerveza → gluten]
    ('B23','gluten'),
    -- B24 Jarra Ladrón de Manzanas  [sidra/vino manzana → sulfitos]
    ('B24','sulfitos'),
    -- B25 Jarra Heineken  [cerveza → gluten]
    ('B25','gluten'),
    -- B26 Jarra El Águila Dorada  [cerveza → gluten]
    ('B26','gluten'),
    -- B28 Heineken 0.0  [sin alcohol pero malta cebada → gluten]
    ('B28','gluten'),
    -- B29 Desperados  [cerveza con tequila → gluten]
    ('B29','gluten'),
    -- B30 Paulaner  [cerveza alemana → gluten]
    ('B30','gluten'),
    -- B31 Buenos Días Ribera de Duero  [vino → sulfitos]
    ('B31','sulfitos'),
    -- B32 Cune Rosado Navarra  [vino → sulfitos]
    ('B32','sulfitos'),
    -- B33 Cune Blanco Verdejo  [vino → sulfitos]
    ('B33','sulfitos'),
    -- B34 Cune Tinto Crianza Rioja  [vino → sulfitos]
    ('B34','sulfitos'),
    -- B36 Café con extra de crema Ruavieja  [crema → lácteos] — ya en BD
    ('B36','lacteos'),
    -- B39 Batido  [lácteos] — ya en BD
    ('B39','lacteos')
  )
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 3. APERITIVOS — INSERT directo con UUIDs completos
--    categoria_id = 32447a0c-6911-4c3f-98d8-88a58d3e15ca
-- =============================================================================
INSERT INTO producto_alergenos (producto_id, alergeno_id) VALUES
  -- Aceitunas de la abuela  [aceitunas conservadas → sulfitos]
  ('f700cf0b-d6a8-4178-9dff-41f34099f0d8', '0c29a237-d755-4bc6-9bac-3853dae16710'),

  -- Cheesy Cheetos® Bites  [maíz + queso → gluten (cross-contact) + lácteos]
  ('0aa86602-8494-437b-9e60-5f95d71d8900', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('0aa86602-8494-437b-9e60-5f95d71d8900', 'dc3a0d9d-0901-4dba-9d9b-910cbee7b454'), -- lacteos

  -- Palomitas de pollo  [masa frita → gluten | rebozado → huevos]
  ('fb40b377-e42f-4d3d-b347-4dcb1cf8ddcd', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('fb40b377-e42f-4d3d-b347-4dcb1cf8ddcd', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos

  -- Palomitas de queso gouda  [masa frita → gluten | queso → lácteos | rebozado → huevos]
  ('17dc39bf-d4ba-4728-91eb-f7c4cba31442', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('17dc39bf-d4ba-4728-91eb-f7c4cba31442', 'dc3a0d9d-0901-4dba-9d9b-910cbee7b454'), -- lacteos
  ('17dc39bf-d4ba-4728-91eb-f7c4cba31442', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos

  -- Patatas fritas con cheddar y bacon ahumado  [salsa cheddar → lácteos | bacon → sulfitos]
  ('3ca1c5df-1578-419d-920d-25ba5012e8b6', 'dc3a0d9d-0901-4dba-9d9b-910cbee7b454'), -- lacteos
  ('3ca1c5df-1578-419d-920d-25ba5012e8b6', '0c29a237-d755-4bc6-9bac-3853dae16710'), -- sulfitos

  -- Salchichas 4 salsas  [salchicha Frankfurt → gluten + soja | alioli → huevos]
  ('a83faca2-9849-4c16-a1ea-f682fd51b923', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('a83faca2-9849-4c16-a1ea-f682fd51b923', '01e23771-5359-4c2c-a975-979554db43b3'), -- soja
  ('a83faca2-9849-4c16-a1ea-f682fd51b923', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos

  -- Patatas fritas 4 salsas  [alioli → huevos]
  ('9ab4f327-1535-4103-b292-2068d18d3d50', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos

  -- Gildas  [boquerón o anchoa → pescado]
  ('a1923e24-7fe9-4228-9301-facb8e37c9c7', '165d4deb-ebf0-4b4e-855b-883552908913'), -- pescado

  -- Nachos  [salsa cheddar → lácteos]
  ('c13184e9-096a-4032-af6a-b9feacb56904', 'dc3a0d9d-0901-4dba-9d9b-910cbee7b454')  -- lacteos

  -- Cucurucho de patatas chips → sin alérgenos declarables (patata + aceite)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 4. RACIONES — INSERT directo con UUIDs completos
--    categoria_id = 1b1a043f-3ff3-4cdf-ad9f-3a2bab122ccf
-- =============================================================================
INSERT INTO producto_alergenos (producto_id, alergeno_id) VALUES
  -- Alitas de pollo  [rebozado → gluten + huevos]
  ('2c747f14-7fad-440b-8947-7c913fbfc644', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('2c747f14-7fad-440b-8947-7c913fbfc644', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos

  -- Croquetas de Jamón  [bechamel → gluten + lácteos + huevos]
  ('3795cecd-4939-49fa-99a5-46b3acf1cb42', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('3795cecd-4939-49fa-99a5-46b3acf1cb42', 'dc3a0d9d-0901-4dba-9d9b-910cbee7b454'), -- lacteos
  ('3795cecd-4939-49fa-99a5-46b3acf1cb42', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos

  -- Patatas fritas Bravioli  [alioli → huevos]
  ('52f15185-4156-4227-868e-12f054e6406b', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos

  -- Croquetas de Mac&Cheese  [pasta + bechamel → gluten + lácteos + huevos]
  ('f105cb80-8834-4b88-b8bd-a13e0fcba607', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('f105cb80-8834-4b88-b8bd-a13e0fcba607', 'dc3a0d9d-0901-4dba-9d9b-910cbee7b454'), -- lacteos
  ('f105cb80-8834-4b88-b8bd-a13e0fcba607', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos

  -- Tiras de pollo  [rebozado → gluten + huevos]
  ('a40bd701-89cc-4457-9a6b-f179eeb6ad20', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('a40bd701-89cc-4457-9a6b-f179eeb6ad20', 'd91f784a-ca67-42be-b9eb-3f7983570b43')  -- huevos

  -- Torreznos (crujientes) → sin alérgenos declarables (piel de cerdo + aceite)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 5. ENSALADAS — INSERT directo con UUIDs completos
--    categoria_id = 4170d84e-abbd-4310-a387-f6171017828a
-- =============================================================================
INSERT INTO producto_alergenos (producto_id, alergeno_id) VALUES
  -- TexMex: pollo kebab, tomate, maíz, aceitunas, nachos TexMex, mostaza y miel
  --   [kebab → soja + apio | nachos TexMex (trigo) → gluten | mostaza y miel → mostaza]
  ('bd45575b-709f-4f36-9e97-00c313cdb71f', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('bd45575b-709f-4f36-9e97-00c313cdb71f', '01e23771-5359-4c2c-a975-979554db43b3'), -- soja
  ('bd45575b-709f-4f36-9e97-00c313cdb71f', '29d3d99d-1c0d-471e-8cbb-b6c079888bf2'), -- apio
  ('bd45575b-709f-4f36-9e97-00c313cdb71f', '5508d416-4387-4c25-ad27-59c1c962463a'), -- mostaza

  -- Campera: pollo, tomate, queso madurado, aceitunas, picatostes, alioli
  --   [picatostes → gluten | queso → lácteos | alioli → huevos | aceitunas → sulfitos]
  ('3d61ba4a-c009-4d0c-bd74-aa20ea5720e4', 'ff6a5259-3965-4ced-972a-6fcc1eb4ce63'), -- gluten
  ('3d61ba4a-c009-4d0c-bd74-aa20ea5720e4', 'dc3a0d9d-0901-4dba-9d9b-910cbee7b454'), -- lacteos
  ('3d61ba4a-c009-4d0c-bd74-aa20ea5720e4', 'd91f784a-ca67-42be-b9eb-3f7983570b43'), -- huevos
  ('3d61ba4a-c009-4d0c-bd74-aa20ea5720e4', '0c29a237-d755-4bc6-9bac-3853dae16710')  -- sulfitos
ON CONFLICT DO NOTHING;
