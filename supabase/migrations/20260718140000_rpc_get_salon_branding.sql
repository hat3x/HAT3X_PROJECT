-- =============================================================================
-- salon-os — RPC pública de solo lectura: public.get_salon_branding(p_slug)
--
-- Resuelve la "Lectura pública (diferida)" que sub-4 dejó anotada DELIBERADAMENTE
-- en docs/salon-branding-design §3 y en el encabezado de
-- 20260718110000_salon_branding.sql: el PWA de reservas / apps cliente-staff
-- (UN código, servido por subdominio) necesitan pintar la marca del salón para
-- VISITANTES ANÓNIMOS (tema por subdominio ANTES del login). sub-4 documentó que,
-- llegado el momento, la opción PREFERIBLE era «una RPC/Edge Function pública que
-- devuelva el branding por slug (sin exponer la tabla)». Esto la implementa.
--
-- POR QUÉ UNA RPC Y NO UNA POLÍTICA anon SOBRE salons/salon_branding:
--   · salons lleva EN LA MISMA FILA datos sensibles del emisor de facturas:
--     tax_id (NIF/CIF), legal_name (razón social), fiscal_address, phone, email,
--     address y settings (jsonb). Abrir un SELECT anon sobre la tabla —aunque
--     fuera "solo columnas de marca"— expone la SUPERFICIE de la tabla al rol
--     anónimo y es un pie forzado para fugas (una policy futura mal escrita, un
--     `select *` de PostgREST, una vista que herede el grant…). Además rompería
--     el guardián de aislamiento (nada a anon/public) y la postura deny-by-default
--     de TODO el esquema (hoy NINGUNA tabla tiene lectura anon).
--   · Una función SECURITY DEFINER con RETURNS TABLE de EXACTAMENTE 5 columnas
--     seguras es una superficie de datos CERRADA por tipo: por construcción no
--     puede devolver una columna sensible aunque su cuerpo cambiara. La tabla
--     sigue intocada (RLS deny-by-default, cero políticas anon). El acceso anónimo
--     entra por UN solo punto auditable, no por la tabla entera.
--
-- CONTRATO (campos EXCLUSIVAMENTE seguros — marca, nada fiscal/PII):
--   name             — nombre COMERCIAL del salón (salons.name; NO legal_name).
--   slug             — el propio slug (kebab, ya público: va en la URL de reservas).
--   logo_url         — logo (salon_branding.logo_url; puede ser null).
--   primary_color    — color principal #rrggbb (default #111827 si no hay branding).
--   secondary_color  — acento #rrggbb o null.
-- NUNCA: tax_id · legal_name · fiscal_address · email · phone · address · settings.
--
-- Devuelve 0 filas si el slug no existe O el salón está inactivo (active=false):
-- un salón dado de baja no filtra ni su marca ni su existencia. "No encontrado"
-- es un CONJUNTO VACÍO, no una excepción — a diferencia de las RPC de escritura
-- (register/award), aquí NO se levantan errores con SQLSTATE: un error distinto
-- para "slug inexistente" sería un ORÁCULO de enumeración innecesario. El propio
-- slug ya es público (está en la URL de la reserva), así que el conjunto vacío
-- filtra lo mínimo: exactamente lo que la página de reservas revela igualmente.
--
-- SEGURIDAD:
--   · SECURITY DEFINER + STABLE + search_path='' — omite RLS de forma CONTROLADA
--     y sin inyección de search_path (todo cualificado; los built-ins de
--     pg_catalog están siempre en el path implícito). Mismo endurecimiento que
--     app.user_salon_ids() / app.salon_has_feature().
--   · language sql (lectura pura, como los helpers de app): proyecta SOLO las 5
--     columnas seguras y filtra active — el gate NO es de identidad (es pública),
--     es de SUPERFICIE (qué columnas) y de ESTADO (solo salones activos).
--   · p_slug entra como PARÁMETRO (bind), nunca concatenado → sin inyección SQL.
--   · EXECUTE: revoke all from public; luego grant EXPLÍCITO a anon Y authenticated
--     (un cliente logueado de OTRO salón, que no es miembro de éste, también debe
--     poder cargar la marca por slug — RLS le ocultaría la tabla).
--
-- Nota honesta de alcance: al ser pública, permite ENUMERAR "¿existe el slug X y
-- está activo?". Es inherente a cualquier sistema de reservas por URL (la propia
-- página de reserva lo revela) y no filtra dato sensible alguno. El abuso por
-- volumen (rate-limiting) se mitiga en el borde (PostgREST/Supabase/CDN), no en SQL.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- La función: JOIN salons ⟕ salon_branding por slug, SOLO salones activos.
--
-- LEFT JOIN (no inner): un salón puede existir SIN fila de branding todavía (el
-- provisioning del branding es lazy — ver salon-branding-design §5). Con inner
-- join, un salón sin personalizar devolvería 0 filas y la página de reservas
-- creería que no existe. Con left join + coalesce del color, un salón activo SIN
-- branding aún se pinta: nombre + slug reales, logo null, color por defecto
-- (#111827, el MISMO default de la columna) → las apps SIEMPRE tienen con qué
-- pintar, invariante que exige el roadmap de white-label.
--
-- name/slug son varchar en salons → cast explícito a text para casar con el tipo
-- de RETURNS TABLE (evita "structure of query does not match function result
-- type"). logo_url/primary_color/secondary_color ya son text en salon_branding.
--
-- slug se normaliza (lower+btrim): la CHECK de salons.slug garantiza que TODOS
-- los slugs almacenados son minúsculas-kebab, así que bajar a minúsculas y
-- recortar espacios de la entrada solo puede CONVERTIR un fallo por formato en un
-- acierto legítimo, nunca provocar un match cruzado. p_slug null → conjunto vacío.
-- slug es UNIQUE y el join a la tabla 1:1 de branding devuelve ≤ 1 fila (sin LIMIT).
-- ------------------------------------------------------------------------------
create or replace function public.get_salon_branding(p_slug text)
returns table (
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
  'Lectura PÚBLICA (anon) del branding de un salón ACTIVO por slug. Devuelve SOLO campos seguros de marca (name, slug, logo_url, primary_color, secondary_color); NUNCA tax_id/legal_name/fiscal_address/email/phone/address/settings. SECURITY DEFINER + STABLE + search_path='''': omite RLS de forma controlada sin exponer la tabla salons. 0 filas si el slug no existe o el salón está inactivo (sin error, para no ser un oráculo de enumeración).';

-- ------------------------------------------------------------------------------
-- EXECUTE: reset del grant PUBLIC por defecto y concesión EXPLÍCITA a anon +
-- authenticated. Es la ÚNICA RPC del esquema abierta a anon (a propósito): la
-- lectura pública del white-label. Sin escritura: es de solo lectura por tipo.
-- ------------------------------------------------------------------------------
revoke all on function public.get_salon_branding(text) from public;
grant  execute on function public.get_salon_branding(text) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- Guardián de aserción (defensa en profundidad — patrón de la casa: loyalty_base
-- §6 / rls_multitenant_guard / salon_features §5). Esta RPC es CRÍTICA: es el
-- ÚNICO camino anónimo a datos que viven en salons. El guardián ABORTA la
-- migración (re-ejecutable en CI/entorno limpio) si una regresión futura:
--   (0) borra la RPC, la degrada de SECURITY DEFINER, o le quita el EXECUTE de
--       anon (rompería la lectura pública) — INVERSO al check de helpers de app.*.
--   (a) cambia su tipo de retorno para EXPONER cualquier columna fuera de las 5
--       seguras (o retirar una): se comprueba a nivel de catálogo que las columnas
--       OUT son EXACTAMENTE {name, slug, logo_url, primary_color, secondary_color}.
--       Éste es el candado central: garantiza estructuralmente el "nunca expongas
--       tax_id/legal_name/fiscal_address/email/phone".
--   (b) abre CUALQUIER política a anon/public sobre salons o salon_branding — la
--       línea roja de la tarea: la lectura pública debe pasar SOLO por la RPC, la
--       tabla entera NUNCA se expone al rol anónimo.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _fn       constant text   := 'public.get_salon_branding(text)';
  _expected constant text[] := array['logo_url','name','primary_color','secondary_color','slug']; -- orden alfabético
  _sd       boolean;
  _outcols  text[];
  _t        text;
  _cnt      integer;
begin
  -- (0) La RPC existe, es SECURITY DEFINER y anon PUEDE ejecutarla.
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
    raise exception 'GUARDIÁN BRANDING PÚBLICO: el rol anon NO puede ejecutar % (lectura pública del white-label rota)', _fn
      using errcode = 'raise_exception';
  end if;

  -- (a) Las columnas de salida son EXACTAMENTE las 5 seguras (candado anti-fuga).
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

  raise notice 'GUARDIÁN BRANDING PÚBLICO: RPC DEFINER ejecutable por anon, retorno acotado a 5 columnas seguras, y ni salons ni salon_branding exponen políticas a anon/public.';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Uso desde el FRONTEND (PWA de reservas / theming por subdominio, sin login):
--     const { data } = await supabase.rpc('get_salon_branding', { p_slug: slug })
--     // data: [] si no existe/está inactivo; si no, [{ name, slug, logo_url,
--     //        primary_color, secondary_color }]. Tomar data?.[0].
--   Al ser STABLE con un único argumento escalar, PostgREST también admite GET
--   (cacheable en CDN): GET /rest/v1/rpc/get_salon_branding?p_slug=mi-salon.
--
-- • Coherencia TS↔SQL (follow-up, MISMO gap ya anotado en audit §0.1 y salon-
--   branding §5): el bloque `Functions` de src/types/database.ts sigue
--   `Record<never, never>` — NINGUNA RPC está reflejada todavía (tampoco
--   register_my_customer_account ni staff_award_visit). Se deja para una tarea de
--   tipos que las incorpore TODAS a la vez (regenerar con `supabase gen types`),
--   no se hace un alta suelta e inconsistente aquí. Firma TS esperada:
--     get_salon_branding: { Args: { p_slug: string };
--       Returns: { name: string; slug: string; logo_url: string | null;
--                  primary_color: string; secondary_color: string | null }[] }
--
-- • Si algún día se añade una columna de marca a salon_branding y debe ser
--   pública, hay que (1) añadirla al SELECT y al RETURNS TABLE y (2) actualizar
--   `_expected` en el guardián (a), o la migración abortará (intencional: fuerza
--   revisar que la nueva columna es segura de exponer a anon).
--
-- • Rollback manual (forward-only; por si hubiera que revertir):
--     drop function if exists public.get_salon_branding(text);
-- =============================================================================
