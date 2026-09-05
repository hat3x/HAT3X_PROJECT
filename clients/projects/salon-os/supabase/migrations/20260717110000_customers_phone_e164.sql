-- =============================================================================
-- salon-os — Migración: IDENTIDAD POR TELÉFONO — customers += phone_e164 (parte B)
--
-- Prepara FASE 3 del roadmap (identidad-por-teléfono; ver docs/roadmap-
-- productizacion.md y la parte A: 20260717100000_customers_user_id.sql). El
-- teléfono es la CLAVE NATURAL con la que el salón, la recepcionista IA y —más
-- adelante— la app de cliente reconocen a una persona. Pero se teclea/dicta de
-- mil formas: '612 34 56 78', '612345678', '+34 612 345 678', '0034612345678',
-- '(+34) 612-345-678'... Todas son el MISMO número. Sin canonicalizar, el dedup
-- por teléfono es imposible y se crean fichas duplicadas de la misma persona.
--
-- Contenido:
--   1. Función IMMUTABLE app.normalize_phone(text) -> E.164 (país por defecto: ES/+34).
--   2. customers += phone_e164 — columna GENERADA (stored) = app.normalize_phone(phone).
--   3. Índice ÚNICO PARCIAL (salon_id, phone_e164) where phone_e164 is not null.
--
-- Todas las variantes de arriba se normalizan a '+34612345678', de modo que el
-- índice único garantiza "un teléfono = una ficha por salón" independientemente
-- del formato con el que se haya tecleado cada vez.
--
-- ── Multi-tenant: el único es (salon_id, phone_e164), NO (phone_e164) global ──
--   Espejo exacto del criterio de email/user_id (idx_customers_salon_email,
--   idx_customers_salon_user): la misma persona puede ser cliente de VARIOS
--   salones (Salón OS es multi-tenant y multi-marca) → UNA ficha por salón con
--   el mismo phone_e164. El único acotado por salón permite "misma persona en N
--   salones" y a la vez prohíbe DOS fichas con el mismo teléfono DENTRO de un
--   salón. salon_id como columna líder, coherente con todo el esquema.
-- =============================================================================


-- ------------------------------------------------------------------------------
-- 1. app.normalize_phone(text) — teléfono en cualquier formato → E.164
--
-- Reglas:
--   • Se queda solo con dígitos y con el '+' de cabecera (fuera espacios, guiones,
--     puntos, paréntesis, letras). Así el '+' sobrevive aunque venga entre
--     paréntesis: '(+34) 612-34-56-78' → '+34612345678'.
--   • Prefijo internacional explícito ('+' o '00', el código de acceso
--     internacional) ⇒ el número YA trae su código de país, se respeta.
--   • Sin prefijo internacional ⇒ se asume número NACIONAL español y se antepone
--     el código de país 34 (España es el país por defecto de Salón OS).
--   • Entrada vacía/basura sin un número real ⇒ NULL (nunca un '+34'/'+' fantasma:
--     si no, todas las fichas con teléfono no-numérico colisionarían en el único).
--
-- Ejemplos:  '612345678'          → '+34612345678'
--            '+34 612 34 56 78'   → '+34612345678'
--            '0034 612 345 678'   → '+34612345678'
--            '(+34) 612-345-678'  → '+34612345678'
--            '', '  ', 'sin tel'  → NULL
--
-- IMMUTABLE (obligatorio): misma entrada ⇒ misma salida SIEMPRE. Es requisito de
--   PostgreSQL para poder usar la función en una columna GENERADA y en índices.
--   La función no lee NINGÚN objeto de la BD (solo funciones internas de texto),
--   por eso es inmutable de verdad y determinista.
-- security invoker + search_path = '': mismo endurecimiento que app.set_updated_at.
--   Al no tocar tablas, search_path='' es seguro (pg_catalog siempre resuelve
--   trim/regexp_replace) y evita cualquier secuestro de search_path.
--
-- NOTA: es una NORMALIZACIÓN pragmática, no un validador E.164 completo. La
--   validación fina de números (longitud por país, operador, móvil vs fijo) vive
--   en la capa de aplicación (p. ej. libphonenumber). Aquí solo garantizamos una
--   forma canónica estable y comparable para el dedup.
-- ------------------------------------------------------------------------------
create or replace function app.normalize_phone(phone text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  cleaned text;   -- solo dígitos y un posible '+' de cabecera
  digits  text;   -- dígitos definitivos, ya con código de país, sin '+'
begin
  if phone is null then
    return null;
  end if;

  -- 1) Fuera todo lo que no sea dígito o '+' (espacios, guiones, puntos,
  --    paréntesis, letras...). El '+' se conserva aunque venga entre paréntesis.
  cleaned := regexp_replace(trim(phone), '[^0-9+]', '', 'g');

  -- 2) Determinar el código de país según el prefijo internacional:
  if cleaned like '+%' then
    -- Ya trae código de país (E.164 con '+'): nos quedamos con sus dígitos.
    digits := regexp_replace(cleaned, '\D', '', 'g');
  elsif cleaned like '00%' then
    -- '00' == código de acceso internacional == '+': lo quitamos y el resto ya
    -- trae su código de país ('0034…' → '34…').
    digits := regexp_replace(regexp_replace(cleaned, '\D', '', 'g'), '^00', '');
  else
    -- Número NACIONAL (sin prefijo internacional): anteponemos España (34).
    digits := '34' || regexp_replace(cleaned, '\D', '', 'g');
  end if;

  -- 3) Guarda de cordura: un teléfono E.164 tiene entre 6 y 15 dígitos (máx. 15
  --    por norma E.164). Si no queda un número real (vacío o basura), NULL — así
  --    'sin tel', '()' o '---' NO se convierten en un falso '+34' que colisionaría.
  if digits !~ '^[0-9]{6,15}$' then
    return null;
  end if;

  return '+' || digits;
end;
$$;

comment on function app.normalize_phone(text) is
  'Normaliza un teléfono en cualquier formato a E.164 con país por defecto España (+34). Robusta ante espacios, guiones, paréntesis y prefijo 00. IMMUTABLE: apta para columnas generadas e índices. Devuelve NULL si la entrada no contiene un número real (6–15 dígitos). Normalización pragmática, no validador E.164 completo.';

-- La función es un helper de TEXTO puro (no accede a datos): se deja ejecutable
-- por todos los roles (grant PUBLIC por defecto). Lo usan tanto la columna
-- generada como el código de app para normalizar el término de búsqueda al
-- localizar una ficha por teléfono ("¿existe ya este número en este salón?").
-- A diferencia de app.user_salon_ids()/has_salon_role() (SECURITY DEFINER que
-- leen salon_members), aquí NO hay nada sensible que revocar.


-- ------------------------------------------------------------------------------
-- 2. customers += phone_e164 — columna GENERADA (stored)
--
-- ¿Por qué COLUMNA GENERADA y no un TRIGGER? (la opción más robusta)
--   • No se puede saltar: GENERATED ALWAYS ... STORED lo aplica el MOTOR en cada
--     INSERT/UPDATE, venga de la app, de un COPY masivo, de SQL manual o de un
--     seed. Un trigger BEFORE se puede desactivar (ALTER TABLE ... DISABLE
--     TRIGGER) y, sobre todo, la replicación lógica corre con
--     session_replication_role = 'replica', que OMITE los triggers de usuario
--     por defecto → phone_e164 quedaría desincronizado. La columna generada no.
--   • Siempre coherente con el origen: el valor es EXACTAMENTE
--     app.normalize_phone(phone), imposible que "derive". No es escribible: nadie
--     puede meter a mano un phone_e164 que no cuadre con phone (un trigger con un
--     bug, o un UPDATE ... SET phone_e164 = …, sí podría).
--   • Declarativa y auto-documentada: la derivación se ve en el esquema (\d
--     customers), no escondida en el cuerpo de un trigger; y sin preocuparnos del
--     orden frente al trigger ya existente trg_customers_updated_at.
--   • Requisito cumplido: la expresión debe ser IMMUTABLE — app.normalize_phone
--     lo es. PostgreSQL 12+ soporta STORED (Supabase corre PG15+).
--
-- Contrapartida (documentada a propósito): al ser STORED, el valor se calcula al
--   ESCRIBIR. Si algún día cambia la lógica de normalización, un simple CREATE OR
--   REPLACE FUNCTION NO recalcula las filas existentes; hay que recrear la columna
--   generada (o hacer un backfill). Además la columna crea una DEPENDENCIA sobre la
--   función: no se podrá DROP FUNCTION app.normalize_phone sin quitar antes la
--   columna (o con CASCADE). Contrapartida asumida y preferible a un trigger frágil.
--
-- Reescritura de tabla: añadir una columna STORED reescribe la tabla (lock
--   ACCESS EXCLUSIVE). Con 0 filas (ver nota final) es instantáneo. En una tabla
--   grande habría que planificar ventana o migración por lotes.
-- ------------------------------------------------------------------------------
alter table public.customers
  add column phone_e164 text
  generated always as (app.normalize_phone(phone)) stored;

comment on column public.customers.phone_e164 is
  'Teléfono canónico en E.164 (p. ej. +34612345678), DERIVADO automáticamente de phone vía app.normalize_phone(). Columna GENERATED ALWAYS ... STORED: no escribible, siempre coherente con phone e imposible de saltar (COPY, replicación, SQL manual). Clave de dedup e identidad-por-teléfono. NULL si phone es NULL o no contiene un número real.';


-- ------------------------------------------------------------------------------
-- 3. Índice ÚNICO PARCIAL (salon_id, phone_e164) — un teléfono = una ficha por salón
--
-- Enforce del dedup por teléfono ya canonicalizado. Parcial where phone_e164 is
-- not null: las fichas sin teléfono (o con teléfono no numérico → NULL) quedan
-- FUERA del único y pueden coexistir sin límite. Mismo patrón exacto que
-- idx_customers_salon_email e idx_customers_salon_user.
--
-- Se mantiene el índice NO único preexistente idx_customers_salon_phone (sobre el
-- phone crudo): sigue sirviendo búsquedas por el texto tal cual se tecleó. El
-- nuevo índice es el canónico para dedup y para "buscar por teléfono
-- normalizado". (Unificarlos sería una limpieza futura, fuera de alcance aquí.)
--
-- create unique index (no CONCURRENTLY): coherente con el resto de migraciones
-- del repo y con la tabla a 0 filas no hay bloqueo que evitar. Si algún día se
-- aplicara sobre una tabla grande y en caliente, usar CREATE UNIQUE INDEX
-- CONCURRENTLY (fuera de transacción).
-- ------------------------------------------------------------------------------
create unique index idx_customers_salon_phone_e164
  on public.customers (salon_id, phone_e164)
  where phone_e164 is not null;

comment on index public.idx_customers_salon_phone_e164 is
  'Un teléfono canónico = una única ficha por salón: prohíbe dos fichas con el mismo phone_e164 dentro de un salón (la misma persona sí puede estar en varios salones). Parcial (phone_e164 not null): fichas sin teléfono quedan fuera y pueden coexistir. Base del dedup/identidad-por-teléfono (FASE 3).';


-- =============================================================================
-- SEGURIDAD DE ESTA MIGRACIÓN Y RESOLUCIÓN DE DUPLICADOS PREVIOS
--
-- Estado HOY: public.customers tiene 0 filas (Salón OS aún en desarrollo, sin
--   datos de producción). Por tanto esta migración es SEGURA e instantánea:
--     • La columna generada se añade sin reescritura real (no hay filas).
--     • El índice único no encuentra ningún duplicado que lo aborte.
--
-- Sin embargo, la migración corre en una TRANSACCIÓN: si el día de mañana ya
-- hubiese filas y DOS de ellas normalizaran al MISMO (salon_id, phone_e164), el
-- paso 3 (CREATE UNIQUE INDEX) fallaría con "could not create unique index …
-- duplicate key value" y ABORTARÍA toda la migración (no deja el esquema a
-- medias). Esto es lo correcto: un duplicado hay que resolverlo a mano, no
-- ocultarlo.
--
-- ── Cómo detectar duplicados ANTES de aplicar (idempotente, no cambia nada) ──
--   Requiere que la función ya exista; puede ejecutarse por separado tras crear
--   solo el paso 1, o en un entorno con la migración aplicada:
--
--     select salon_id,
--            app.normalize_phone(phone) as phone_e164,
--            count(*)                    as fichas,
--            array_agg(id order by created_at) as customer_ids
--     from public.customers
--     where app.normalize_phone(phone) is not null
--     group by salon_id, app.normalize_phone(phone)
--     having count(*) > 1;
--
-- ── Cómo resolver cada grupo duplicado (misma persona, fichas repetidas) ──
--   Por cada fila devuelta (mismo salón + mismo teléfono canónico):
--     1. Elegir la ficha "superviviente" (normalmente la más antigua / más
--        completa) y las "redundantes" del array customer_ids.
--     2. Reasignar las referencias de las redundantes a la superviviente:
--          update public.appointments set customer_id = <superviviente>
--            where customer_id = <redundante>;
--          update public.visits       set customer_id = <superviviente>
--            where customer_id = <redundante>;
--        (y cualquier otra tabla que referencie customers).
--     3. Volcar a la superviviente los datos que solo tuviera la redundante
--        (email, notes, marketing_consent, user_id…) según criterio de negocio.
--     4. Borrar la ficha redundante:  delete from public.customers where id = <redundante>;
--     5. Repetir hasta que la consulta de detección no devuelva filas y reaplicar
--        la migración.
--   Alternativa si NO se quiere fusionar: diferenciar el teléfono de una de las
--   fichas (corregir el dato erróneo) para que dejen de colisionar.
--
-- ── Rollback manual (forward-only; por si hubiera que revertir) ──
--     drop index if exists public.idx_customers_salon_phone_e164;
--     alter table public.customers drop column if exists phone_e164;
--     drop function if exists app.normalize_phone(text);
--   (En este orden: la columna depende de la función; hay que quitarla antes.)
-- =============================================================================
