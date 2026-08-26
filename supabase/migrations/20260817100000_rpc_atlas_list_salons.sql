-- =============================================================================
-- salon-os — RPC de inventario para Atlas: public.atlas_list_salons()
--
-- POR QUÉ EXISTE:
--   Atlas (apps/atlas) vigila la infraestructura de HAT3X y necesita un check por
--   cada tenant de Kairos. Hoy esa lista se mantiene A MANO y nace caducada: los
--   salones se dan de alta desde el panel kairos-admin, que escribe directo en la
--   base y deriva el slug del nombre — no queda rastro en ningún fichero. De hecho
--   ya pasó: dos de los cinco tenants activos no estaban en ninguna lista.
--   Peor aún, un salón DESACTIVADO devuelve el mismo 404 que uno inexistente, así
--   que sin esta lista cada baja legítima de cliente le genera a Atlas una alerta
--   de caída falsa para siempre.
--
-- POR QUÉ service_role Y NO anon:
--   get_salon_branding declara ser «la ÚNICA RPC del esquema abierta a anon (a
--   propósito)» y responde por UN slug concreto. Esto es distinto: devuelve el
--   CENSO. Los slugs y los nombres comerciales ya son públicos de uno en uno —van
--   en la URL de reservas—, pero la lista AGREGADA no lo es: dice cuántos clientes
--   tiene Kairos y quiénes son. Abrirla a anon regalaría inteligencia comercial y
--   rompería la postura deny-by-default del esquema por comodidad de un vigilante.
--   Tampoco vale `authenticated`: Kairos permite registro público de clientes
--   finales (register_my_customer_account), así que ese rol incluye a cualquiera
--   que se registre en cualquier salón.
--
--   Queda service_role, que es el rol del backend. Atlas guardará esa clave en su
--   llavero cifrado (AES-256-GCM, descifrado solo en servidor, cada uso registrado
--   en credencial_usos).
--
--   HONESTIDAD SOBRE EL ALCANCE: quien tenga la service_role ya puede leer TODO
--   Kairos por PostgREST, con esta RPC o sin ella. Esta función NO añade poder;
--   lo que hace es dar a Atlas una superficie ACOTADA para su caso de uso, de modo
--   que su código nunca haga `select * from salons` ni acabe con tax_id o
--   legal_name en sus propias tablas y en sus registros. La decisión de riesgo
--   real es guardar la service_role de Kairos dentro de Atlas — declarada y
--   aceptada en §13 del spec de Atlas.
--
-- CONTRATO (tres columnas, ninguna sensible):
--   slug    — kebab, ya público: va en la URL de reservas.
--   name    — nombre COMERCIAL (salons.name; NUNCA legal_name).
--   sector  — peluqueria | odontologia | restauracion. Atlas lo usa para agrupar.
-- NUNCA: tax_id · legal_name · fiscal_address · email · phone · address · settings.
--
-- Solo salones ACTIVOS. Es justo lo que resuelve el 404 ambiguo: lo que no está
-- en esta lista está de baja, no caído, y Atlas debe callarse en vez de alertar.
--
-- SEGURIDAD: SECURITY DEFINER + STABLE + search_path='' — mismo endurecimiento
-- que get_salon_branding. Sin parámetros: no hay superficie de inyección.
-- =============================================================================

begin;

create or replace function public.atlas_list_salons()
returns table (
  slug    text,
  name    text,
  sector  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.slug::text   as slug,
    s.name::text   as name,
    s.sector::text as sector
  from public.salons s
  where s.active
  order by s.slug;
$$;

comment on function public.atlas_list_salons() is
  'Censo de salones ACTIVOS para el vigilante Atlas. Devuelve SOLO slug, nombre comercial y sector; NUNCA tax_id/legal_name/fiscal_address/email/phone/address/settings. SECURITY DEFINER + STABLE + search_path='''': lee salons sin exponer la tabla. Concedida EXCLUSIVAMENTE a service_role — a diferencia de get_salon_branding, esto es el censo completo y no debe abrirse a anon ni a authenticated (Kairos permite registro público de clientes finales).';

-- ------------------------------------------------------------------------------
-- EXECUTE: reset del grant PUBLIC por defecto y concesión exclusiva a
-- service_role. Ni anon ni authenticated: ver la cabecera.
-- ------------------------------------------------------------------------------
revoke all on function public.atlas_list_salons() from public;
grant  execute on function public.atlas_list_salons() to service_role;

-- ------------------------------------------------------------------------------
-- Guardián de aserción (patrón de la casa: get_salon_branding §guard,
-- service_api_keys §3). Aborta la migración —re-ejecutable en CI— si una
-- regresión futura:
--   (0) borra la RPC o la degrada de SECURITY DEFINER;
--   (a) cambia su retorno para exponer una columna fuera de las tres seguras;
--   (b) se la concede a anon o a authenticated, que es el error que convertiría
--       el censo de clientes de HAT3X en información pública.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _fn       constant text   := 'public.atlas_list_salons()';
  _expected constant text[] := array['name','sector','slug'];  -- orden alfabético
  _sd       boolean;
  _outcols  text[];
  _rol      text;
begin
  -- (0) Existe y es SECURITY DEFINER.
  select p.prosecdef into _sd
  from pg_proc p
  where p.oid = to_regprocedure(_fn);

  if _sd is null then
    raise exception 'GUARDIÁN ATLAS: falta la RPC % (el descubridor de tenants dejaría de funcionar)', _fn
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception 'GUARDIÁN ATLAS: la RPC % ya no es SECURITY DEFINER (no podría leer salons bajo RLS)', _fn
      using errcode = 'raise_exception';
  end if;

  -- (a) Devuelve EXACTAMENTE las tres columnas seguras.
  select array_agg(x.argname order by x.argname)
    into _outcols
  from pg_proc p
  cross join lateral unnest(p.proargnames, p.proargmodes) as x(argname, argmode)
  where p.oid = to_regprocedure(_fn)
    and x.argmode = 't';

  if _outcols is distinct from _expected then
    raise exception 'GUARDIÁN ATLAS: la RPC % devuelve columnas % — se esperaban EXACTAMENTE % (posible fuga de columna sensible de salons)',
      _fn, coalesce(_outcols::text, '<ninguna>'), _expected::text
      using errcode = 'raise_exception';
  end if;

  -- (b) NADIE salvo service_role puede ejecutarla. El censo no es público.
  foreach _rol in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = _rol)
       and has_function_privilege(_rol, _fn, 'execute')
    then
      raise exception 'GUARDIÁN ATLAS: el rol % puede ejecutar % — el censo de salones NO debe ser público (a diferencia de get_salon_branding, que responde por un slug concreto)', _rol, _fn
        using errcode = 'raise_exception';
    end if;
  end loop;

  raise notice 'GUARDIÁN ATLAS: RPC DEFINER acotada a 3 columnas seguras y ejecutable solo por service_role.';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Uso desde Atlas (con la service_role de Kairos, guardada en su llavero):
--     POST /rest/v1/rpc/atlas_list_salons
--     → [{ slug, name, sector }, …] de los salones ACTIVOS.
--
-- • Lo que Atlas hace con la respuesta: da de alta un check por cada slug nuevo
--   y PAUSA —sin alertar— los de los slugs que desaparezcan. Un salón que se
--   desactiva sale de esta lista, y por eso Atlas sabe distinguir «este cliente
--   está de baja» de «este cliente está caído», que por HTTP son el mismo 404.
--
-- • Si algún día hay que añadir una columna al retorno, hay que actualizar
--   `_expected` en el guardián (a) o la migración abortará — intencional: fuerza
--   a revisar que la columna nueva es segura de exponer.
--
-- • Si algún día se quiere abrir a otro rol, que NO sea anon ni authenticated:
--   el guardián (b) lo impide a propósito. Reabrir esa discusión con la cabecera
--   delante, no quitando el guardián.
--
-- • Rollback manual (forward-only; por si hubiera que revertir):
--     drop function if exists public.atlas_list_salons();
-- =============================================================================
