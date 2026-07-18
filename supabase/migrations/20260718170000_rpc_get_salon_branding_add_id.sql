-- =============================================================================
-- salon-os — get_salon_branding: añadir el identificador OPACO (salons.id) al
-- contrato de la RPC pública de branding.  (follow-up de 20260718140000)
--
-- QUÉ CAMBIA — y SOLO esto: la RPC pasa de devolver 5 columnas a 6, añadiendo
-- `id uuid` (= salons.id) como PRIMER campo.  Las otras CINCO —name, slug,
-- logo_url, primary_color, secondary_color— quedan INTACTAS: mismo nombre, mismo
-- tipo, misma expresión, misma semántica.  No se toca el filtro (solo salones
-- activos), ni el endurecimiento (SECURITY DEFINER + STABLE + search_path=''),
-- ni el conjunto-vacío-sin-error para "no encontrado", ni el acceso ANÓNIMO.
--
-- POR QUÉ ES SEGURO EXPONER `id` (identificador OPACO, no fiscal, no PII):
--   · salons.id es `uuid primary key default gen_random_uuid()` — un
--     identificador ALEATORIO (UUID v4), NO secuencial.  A diferencia de un
--     bigserial, NO revela conteo de salones, orden de alta ni volumen de
--     negocio: es una etiqueta interna sin significado externo.  NO es dato
--     fiscal ni PII.
--   · El slug ya es público (va en la URL de reservas) y ya identifica al salón;
--     el uuid es simplemente una clave estable y opaca que el frontend puede usar
--     (React keys, caché, correlación de peticiones) sin re-resolver el slug.  No
--     amplía la superficie sensible: se sigue SIN exponer tax_id / legal_name /
--     fiscal_address / email / phone / address / settings.
--
-- POR QUÉ DROP + CREATE Y NO `create or replace` A SECAS:
--   PostgreSQL NO permite cambiar el TIPO DE RETORNO de una función con
--   `create or replace`, y añadir una columna a un RETURNS TABLE ES cambiar el
--   tipo de retorno (las columnas de salida son parámetros OUT que componen el
--   tipo del resultado).  Intentarlo aborta con «cannot change return type of
--   existing function / HINT: Use DROP FUNCTION ... first».  Por eso se DROPEA y
--   se RECREA — exactamente el rollback que ya anotaba 20260718140000.  El DROP
--   destruye los GRANT, así que se RE-CONCEDE explícitamente el EXECUTE a
--   anon+authenticated más abajo: sin ese re-grant, la lectura pública del
--   white-label quedaría rota (el guardián (0) lo detecta si se omite).
--
-- CONTRATO ACTUALIZADO (campos EXCLUSIVAMENTE seguros):
--   id               — salons.id (uuid OPACO). NUEVO en esta migración.
--   name             — nombre COMERCIAL del salón (salons.name; NO legal_name).
--   slug             — el propio slug (kebab, ya público: va en la URL).
--   logo_url         — logo (salon_branding.logo_url; puede ser null).
--   primary_color    — color principal #rrggbb (default #111827 si no hay branding).
--   secondary_color  — acento #rrggbb o null.
-- NUNCA: tax_id · legal_name · fiscal_address · email · phone · address · settings.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- Ningún objeto SQL depende de la RPC (solo la invoca el frontend por PostgREST;
-- no hay vistas/funciones/políticas que la llamen — verificado en el catálogo).
-- El drop SIN cascade es seguro y, de haber una dependencia inesperada, preferimos
-- que la migración falle RUIDOSAMENTE a cascadear en silencio.  `if exists` la
-- mantiene re-ejecutable en CI/entorno limpio.
-- ------------------------------------------------------------------------------
drop function if exists public.get_salon_branding(text);

-- ------------------------------------------------------------------------------
-- Re-creación IDÉNTICA a 20260718140000 salvo la columna `id uuid` (primera).
-- s.id ya es uuid → sin cast.  name/slug siguen con cast explícito a text para
-- casar con el RETURNS TABLE.  LEFT JOIN a salon_branding (1:1, provisioning lazy)
-- + coalesce del color por defecto: un salón activo SIN branding aún se pinta.
-- slug normalizado (lower+btrim); p_slug entra por bind (sin inyección).
-- ------------------------------------------------------------------------------
create function public.get_salon_branding(p_slug text)
returns table (
  id               uuid,
  name             text,
  slug             text,
  logo_url         text,
  primary_color    text,
  secondary_color  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id                                  as id,
    s.name::text                          as name,
    s.slug::text                          as slug,
    b.logo_url                            as logo_url,
    coalesce(b.primary_color, '#111827')  as primary_color,
    b.secondary_color                     as secondary_color
  from public.salons s
  left join public.salon_branding b on b.salon_id = s.id
  where s.slug = lower(btrim(p_slug))
    and s.active;
$$;

comment on function public.get_salon_branding(text) is
  'Lectura PÚBLICA (anon) del branding de un salón ACTIVO por slug. Devuelve SOLO campos seguros: id (uuid OPACO = salons.id), name, slug, logo_url, primary_color, secondary_color; NUNCA tax_id/legal_name/fiscal_address/email/phone/address/settings. SECURITY DEFINER + STABLE + search_path='''': omite RLS de forma controlada sin exponer la tabla salons. 0 filas si el slug no existe o el salón está inactivo (sin error, para no ser un oráculo de enumeración).';

-- ------------------------------------------------------------------------------
-- RE-GRANT tras el DROP: el DROP borró los privilegios de la función anterior, así
-- que se restablece la ÚNICA concesión anon del esquema (la lectura pública del
-- white-label).  Reset del PUBLIC por defecto + concesión EXPLÍCITA a anon +
-- authenticated (un cliente logueado de OTRO salón también debe poder pintar la
-- marca por slug — RLS le ocultaría la tabla).  Sigue siendo de solo lectura por tipo.
-- ------------------------------------------------------------------------------
revoke all on function public.get_salon_branding(text) from public;
grant  execute on function public.get_salon_branding(text) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- Guardián de aserción (defensa en profundidad — patrón de la casa: loyalty_base
-- §6 / rls_multitenant_guard / salon_features §5 / el propio 20260718140000).
-- ABORTA la migración (re-ejecutable en CI) si una regresión futura:
--   (0) borra la RPC, la degrada de SECURITY DEFINER, o —clave tras el DROP— NO
--       re-concede el EXECUTE a anon (rompería la lectura pública).
--   (a) cambia el retorno para exponer una columna fuera de las 6 seguras (o
--       retira una): se comprueba a nivel de catálogo que las columnas OUT son
--       EXACTAMENTE {id, name, slug, logo_url, primary_color, secondary_color}.
--       Éste es el candado central anti-fuga de tax_id/legal_name/email/phone/…
--   (a.bis) `id` es OPACO por TIPO: uuid, nunca un entero secuencial que filtre
--       conteo/orden de alta.  Ancla el "identificador opaco" en el catálogo.
--   (b) abre CUALQUIER política a anon/public sobre salons o salon_branding — la
--       lectura pública debe pasar SOLO por la RPC, nunca por la tabla entera.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _fn       constant text   := 'public.get_salon_branding(text)';
  _expected constant text[] := array['id','logo_url','name','primary_color','secondary_color','slug']; -- orden alfabético
  _sd       boolean;
  _outcols  text[];
  _idtype   text;
  _t        text;
  _cnt      integer;
begin
  -- (0) La RPC existe, es SECURITY DEFINER y anon PUEDE ejecutarla (si el re-grant
  --     posterior al DROP se hubiera omitido, esto lo detecta).
  select p.prosecdef into _sd
  from pg_proc p
  where p.oid = to_regprocedure(_fn);

  if _sd is null then
    raise exception 'GUARDIÁN BRANDING PÚBLICO: falta la RPC % (lectura pública rota)', _fn
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception 'GUARDIÁN BRANDING PÚBLICO: la RPC % ya no es SECURITY DEFINER (no podría leer salons bajo RLS)', _fn
      using errcode = 'raise_exception';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon')
     and not has_function_privilege('anon', _fn, 'execute')
  then
    raise exception 'GUARDIÁN BRANDING PÚBLICO: el rol anon NO puede ejecutar % (re-grant tras el DROP omitido; lectura pública del white-label rota)', _fn
      using errcode = 'raise_exception';
  end if;

  -- (a) Las columnas de salida son EXACTAMENTE las 6 seguras — ahora con `id`.
  --     En una función RETURNS TABLE, las columnas de resultado son parámetros OUT
  --     con proargmode 't'; se comparan (ordenadas) contra la lista esperada.
  select array_agg(x.argname order by x.argname)
    into _outcols
  from pg_proc p
  cross join lateral unnest(p.proargnames, p.proargmodes) as x(argname, argmode)
  where p.oid = to_regprocedure(_fn)
    and x.argmode = 't';

  if _outcols is distinct from _expected then
    raise exception 'GUARDIÁN BRANDING PÚBLICO: la RPC % devuelve columnas % — se esperaban EXACTAMENTE % (posible fuga de columna sensible de salons)',
      _fn, coalesce(_outcols::text, '<ninguna>'), _expected::text
      using errcode = 'raise_exception';
  end if;

  -- (a.bis) El tipo de la columna `id` es uuid (identificador OPACO). Se localiza
  --     por proallargtypes (IN+OUT alineado con proargnames/proargmodes cuando hay
  --     parámetros OUT, como aquí) y se exige exactamente 'uuid'.
  select format_type(x.atype, null)
    into _idtype
  from pg_proc p
  cross join lateral unnest(p.proargnames, p.proargmodes, p.proallargtypes)
    as x(argname, argmode, atype)
  where p.oid = to_regprocedure(_fn)
    and x.argmode = 't'
    and x.argname = 'id';

  if _idtype is distinct from 'uuid' then
    raise exception 'GUARDIÁN BRANDING PÚBLICO: la columna id de % es % — se esperaba uuid (identificador OPACO, no secuencial)',
      _fn, coalesce(_idtype, '<ninguna>')
      using errcode = 'raise_exception';
  end if;

  -- (b) Ni salons ni salon_branding tienen política alguna abierta a anon/public.
  --     (La lectura pública entra SOLO por la RPC; la tabla no se expone jamás.)
  foreach _t in array array['salons', 'salon_branding'] loop
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public'
      and tablename  = _t
      and (roles && array['anon', 'public']::name[]);
    if _cnt > 0 then
      raise exception 'GUARDIÁN BRANDING PÚBLICO: public.% tiene % política(s) a anon/public — la lectura pública debe pasar SOLO por get_salon_branding, nunca por la tabla', _t, _cnt
        using errcode = 'raise_exception';
    end if;
  end loop;

  raise notice 'GUARDIÁN BRANDING PÚBLICO: RPC DEFINER ejecutable por anon, retorno acotado a 6 columnas seguras (id uuid + 5 de marca), y ni salons ni salon_branding exponen políticas a anon/public.';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Uso desde el FRONTEND (PWA de reservas / theming por subdominio, sin login):
--     const { data } = await supabase.rpc('get_salon_branding', { p_slug: slug })
--     // data: [] si no existe/está inactivo; si no, [{ id, name, slug, logo_url,
--     //        primary_color, secondary_color }]. Tomar data?.[0].
--   `id` es puramente ADITIVO: los consumidores que ya leían name/slug/colores no
--   se ven afectados (supabase-js/PostgREST devuelven objetos por NOMBRE, así que
--   la posición ordinal no forma parte del contrato observable).
--
-- • Coherencia TS↔SQL (mismo gap ya anotado en 20260718140000 §NOTAS y audit
--   §0.1): src/types/database.ts sigue con `Functions: Record<never, never>`. La
--   firma TS esperada de esta RPC, cuando se regeneren TODAS a la vez
--   (`supabase gen types`), es:
--     get_salon_branding: { Args: { p_slug: string };
--       Returns: { id: string; name: string; slug: string;
--                  logo_url: string | null; primary_color: string;
--                  secondary_color: string | null }[] }
--
-- • Añadir/retirar cualquier columna futura del RETURNS TABLE obliga de nuevo a
--   DROP + CREATE (PostgreSQL no deja cambiar el tipo de retorno con REPLACE) y a
--   actualizar `_expected` en el guardián (a), o la migración abortará
--   (intencional: fuerza revisar que la nueva columna es segura para anon).
--
-- • Rollback manual (forward-only; vuelve al contrato de 5 columnas):
--     -- re-ejecutar 20260718140000_rpc_get_salon_branding.sql, o bien:
--     drop function if exists public.get_salon_branding(text);
--     -- ...y recrear la versión de 5 columnas (con su revoke/grant y guardián).
-- =============================================================================
