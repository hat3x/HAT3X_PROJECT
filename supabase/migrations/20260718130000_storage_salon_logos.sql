-- =============================================================================
-- salon-os — Migración: bucket de Storage 'salon-logos' (logo white-label por salón)
--
-- Complementa la migración 20260718110000_salon_branding (sub-4): la columna
-- public.salon_branding.logo_url guarda la URL/ruta del logo, pero el FICHERO en sí
-- (los bytes de la imagen) vive en Supabase Storage. Esta migración crea el bucket
-- que lo aloja y las políticas que gobiernan quién puede escribirlo.
--
-- CONVENCIÓN DE RUTA (clave de objeto dentro del bucket):
--
--     {salon_id}/logo.<ext>              p. ej.  9f2c…-…/logo.png
--
--   · El PRIMER segmento de la ruta es SIEMPRE el uuid del salón. Es lo que la
--     política de escritura usa para autorizar: un owner/manager solo puede escribir
--     bajo la carpeta de SU salón (aislamiento por salon_id, igual que el resto del
--     esquema, pero trasladado a storage.objects vía storage.foldername(name)).
--   · Nombre canónico recomendado: {salon_id}/logo.png (un logo por salón, se
--     sobrescribe con upsert al cambiarlo). La autorización depende SOLO del primer
--     segmento, así que también valen nombres versionados para cache-busting
--     (p. ej. {salon_id}/logo-1737200000.webp) sin tocar las políticas.
--   · logo_url en salon_branding apunta a la URL pública del objeto:
--     {SUPABASE_URL}/storage/v1/object/public/salon-logos/{salon_id}/logo.png
--
-- AISLAMIENTO / POSTURA DE SEGURIDAD:
--   · LECTURA PÚBLICA (bucket public=true + política SELECT a anon/authenticated):
--     el logo es un ACTIVO DE MARCA de cara al público (se pinta en el PWA de
--     reservas, en emails, en la web del salón), como el favicon de una web. Servir
--     sus bytes sin autenticar es el comportamiento deseado y NO filtra datos de
--     tenant: conocer un salon_id no da acceso a nada, y una imagen de logo no es
--     información sensible. Esto es ORTOGONAL a la "lectura pública diferida" de la
--     TABLA salon_branding (docs/salon-branding-design §"Lectura pública (diferida)"):
--     allí lo que se difiere es exponer la FILA (colores + string logo_url) a anon
--     sobre public.*; aquí se exponen los BYTES de la imagen sobre storage.objects.
--     Son superficies distintas; el guardián deny-by-default de public.* no aplica a
--     storage.objects.
--   · ESCRITURA (INSERT/UPDATE/DELETE): SOLO owner/manager del salón dueño de la
--     ruta, vía app.has_salon_role (mismo gate que services/products/salon_branding).
--     staff puede LEER (es público) pero no subir ni borrar logos. anon jamás escribe.
--
-- Estado: proyecto en desarrollo, sin datos de producción. Se asume que RLS ya está
-- habilitada en storage.objects (Supabase lo hace por defecto); el guardián lo
-- ASERTA en vez de intentar (re)activarla, para no depender de la propiedad de la
-- tabla del esquema storage.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Bucket 'salon-logos' — público, solo imágenes, tamaño acotado.
--    Idempotente: on conflict → update mantiene los ajustes en sync si ya existe.
-- ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'salon-logos',
  'salon-logos',
  true,                                   -- lectura pública (activo de marca)
  2097152,                                -- 2 MiB: de sobra para un logo
  array[                                  -- solo imágenes web habituales
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'image/avif'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------------------
-- 2. Helper: uuid del salón a partir de la clave del objeto ({salon_id}/logo.png).
--
--    Extrae el PRIMER segmento de carpeta (storage.foldername(name)[1]) y lo castea
--    a uuid de forma SEGURA: si la ruta está malformada o el segmento no es un uuid,
--    devuelve NULL (no lanza) → app.has_salon_role(NULL, …) da false → la escritura
--    se DENIEGA limpiamente en vez de reventar la sentencia con un error de cast.
--    SECURITY INVOKER: no toca tablas, no necesita privilegios elevados.
-- ------------------------------------------------------------------------------
create or replace function app.storage_object_salon_id(_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  _first text := (storage.foldername(_name))[1];
  _sid   uuid;
begin
  if _first is null then
    return null;
  end if;
  begin
    _sid := _first::uuid;
  exception when others then
    return null;                          -- primer segmento no es un uuid válido
  end;
  return _sid;
end;
$$;

comment on function app.storage_object_salon_id(text) is
  'Devuelve el uuid del salón a partir de la clave de un objeto de Storage cuyo primer segmento de ruta es el salon_id ({salon_id}/…). NULL si la ruta no empieza por un uuid válido. Usada por las políticas de escritura del bucket salon-logos.';

revoke execute on function app.storage_object_salon_id(text) from anon, public;
grant  execute on function app.storage_object_salon_id(text) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. Políticas sobre storage.objects, acotadas a bucket_id = 'salon-logos'.
--    Nombre con prefijo salon_logos_ → no colisiona con políticas de otros buckets
--    y el guardián (paso 4) las localiza por prefijo. drop-if-exists = idempotencia.
-- ------------------------------------------------------------------------------

-- 3a. LECTURA PÚBLICA — cualquiera (anon o autenticado) puede leer los logos.
drop policy if exists "salon_logos_public_read" on storage.objects;
create policy "salon_logos_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'salon-logos');

-- 3b. INSERT — solo owner/manager del salón dueño de la ruta.
drop policy if exists "salon_logos_managers_insert" on storage.objects;
create policy "salon_logos_managers_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'salon-logos'
    and app.has_salon_role(
          app.storage_object_salon_id(name),
          array['owner','manager']::public.member_role[]
        )
  );

-- 3c. UPDATE — solo owner/manager; using (fila actual) y with check (fila nueva),
--     ambos anclados a la carpeta del salón para impedir "mover" a otro salón.
drop policy if exists "salon_logos_managers_update" on storage.objects;
create policy "salon_logos_managers_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'salon-logos'
    and app.has_salon_role(
          app.storage_object_salon_id(name),
          array['owner','manager']::public.member_role[]
        )
  )
  with check (
    bucket_id = 'salon-logos'
    and app.has_salon_role(
          app.storage_object_salon_id(name),
          array['owner','manager']::public.member_role[]
        )
  );

-- 3d. DELETE — solo owner/manager del salón dueño de la ruta.
drop policy if exists "salon_logos_managers_delete" on storage.objects;
create policy "salon_logos_managers_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'salon-logos'
    and app.has_salon_role(
          app.storage_object_salon_id(name),
          array['owner','manager']::public.member_role[]
        )
  );

-- ------------------------------------------------------------------------------
-- 4. Guardián de aserción (defensa en profundidad) — mismo espíritu que
--    20260714110000_rls_multitenant_guard y salon_branding §guard. Si una migración
--    futura borra/afloja estas políticas, deja de existir el bucket, lo hace privado,
--    deshabilita RLS en storage.objects o abre la ESCRITURA a anon o sin gate de
--    owner/manager, esta comprobación ABORTA de forma ruidosa (CI) en vez de degradar
--    el aislamiento o el modelo de permisos en silencio.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _cnt integer;
  _pol record;
begin
  -- (a) El bucket existe y es público.
  select count(*) into _cnt
  from storage.buckets
  where id = 'salon-logos'
    and public;
  if _cnt = 0 then
    raise exception
      'GUARDIÁN STORAGE: el bucket salon-logos no existe o no es público (lectura pública del logo rota)'
      using errcode = 'raise_exception';
  end if;

  -- (b) RLS habilitada en storage.objects (deny-by-default de la escritura).
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage'
    and c.relname = 'objects'
    and c.relrowsecurity;
  if _cnt = 0 then
    raise exception
      'GUARDIÁN STORAGE: storage.objects no tiene RLS habilitada (escritura sin control por política)'
      using errcode = 'raise_exception';
  end if;

  -- (c) Existe la política de LECTURA acotada al bucket salon-logos.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'storage'
    and tablename  = 'objects'
    and policyname like 'salon_logos_%'
    and cmd in ('SELECT', 'ALL')
    and coalesce(qual, '') like '%salon-logos%';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN STORAGE: falta la política SELECT del bucket salon-logos (lectura pública del logo rota)'
      using errcode = 'raise_exception';
  end if;

  -- (d) Toda política de ESCRITURA (INSERT/UPDATE/DELETE) del bucket exige
  --     app.has_salon_role (owner/manager). Si alguna la pierde, aborta.
  for _pol in
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname like 'salon_logos_%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    if coalesce(_pol.qual, '') || coalesce(_pol.with_check, '') not like '%has_salon_role%' then
      raise exception
        'GUARDIÁN STORAGE: la política de escritura %.% (%) del bucket salon-logos no exige app.has_salon_role (escritura no restringida a owner/manager)',
        'storage.objects', _pol.policyname, _pol.cmd
        using errcode = 'raise_exception';
    end if;
  end loop;

  -- (e) Ninguna política de ESCRITURA del bucket está abierta a anon/public.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'storage'
    and tablename  = 'objects'
    and policyname like 'salon_logos_%'
    and cmd in ('INSERT', 'UPDATE', 'DELETE')
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception
      'GUARDIÁN STORAGE: % política(s) de escritura del bucket salon-logos abiertas a anon/public (subida/borrado sin autenticar)', _cnt
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN STORAGE: bucket salon-logos verificado (público en lectura, escritura owner/manager por salon_id).';
end;
$guard$;

commit;
