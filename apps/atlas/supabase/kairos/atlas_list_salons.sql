--
-- ESTO NO ES UNA MIGRACIÓN DE ATLAS. Va en el Supabase de KAIROS.
--
-- No cuelga de `supabase/migrations/` a propósito: la CLI de Atlas aplicaría
-- ahí cualquier fichero, y esto tiene que correr en otra base. Se pega a mano
-- en el editor SQL de Kairos, una vez.
--
-- Es el censo que lee el descubridor (`src/lib/descubrir/kairos.ts`): la lista
-- de salones dados de alta. Sin ella, Atlas no puede distinguir un cliente dado
-- de baja de uno caído —por HTTP los dos devuelven 404— y acabaría alertando de
-- cada baja legítima para siempre.
--
-- Mientras no esté desplegada, la RPC responde 404 y el descubridor lo anota en
-- `descubrimientos` sin tocar la vigilancia. Ese es el estado de partida.
--

create or replace function atlas_list_salons()
returns table (slug text, name text, sector text)
language sql
stable
-- `security definer` para que Atlas no necesite permiso de lectura sobre
-- `salons` entera: la función es la única puerta, y solo enseña tres columnas.
security definer
set search_path = public
as $$
  -- Los `::text` explícitos y no las columnas a pelo: si en Kairos alguna es
  -- `varchar`, la firma `returns table (… text)` fallaría en ejecución con un
  -- error de tipos que desde Atlas se leería como «la respuesta no es una lista
  -- de salones», y el motivo real quedaría escondido.
  select s.slug::text, s.name::text, s.sector::text
  from salons s
  -- `is true` y no `s.active` a secas: un `active` nulo no es «está de alta»,
  -- y conviene que eso esté escrito y no dependa de cómo se lea un nulo.
  where s.active is true
  order by s.slug
$$;

-- Postgres concede EXECUTE a PUBLIC por defecto, y PostgREST expone al mundo
-- toda función ejecutable por `anon`. Sin este `revoke`, el censo de clientes de
-- HAT3X sería público en internet.
revoke all on function atlas_list_salons() from public;
revoke all on function atlas_list_salons() from anon;
revoke all on function atlas_list_salons() from authenticated;
grant execute on function atlas_list_salons() to service_role;

-- Comprobación tras pegarlo. Debe devolver filas, y con `anon` debe fallar:
--   select * from atlas_list_salons();
--   set local role anon; select * from atlas_list_salons();  -- permiso denegado
