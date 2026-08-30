-- apps/atlas/supabase/migrations/20260830110000_aviso_fichaje.sql
--
-- El aviso del fichaje que se dejó abierto.
--
-- El `check` de `notificaciones.tipo` nació en el 2B con dos valores. Una
-- migración aplicada no se edita: se suelta la restricción y se vuelve a crear
-- con el tercero. El nombre es el que Postgres le dio por convención.
alter table notificaciones drop constraint notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('incidencia','cobro','fichaje'));

-- El candado: «¿ya avisé a esta persona de ESTE fichaje?». Se resuelve
-- comparando `enviada_en` con el inicio del fichaje abierto, así que el
-- índice es por usuario y tipo, con la fecha detrás.
create index notificaciones_fichaje_por_usuario
  on notificaciones (usuario_id, enviada_en desc) where tipo = 'fichaje';

-- ---------- el disparo ----------
-- Misma Edge Function que incidencias y cobro, con otro cuerpo. Cada hora, y
-- con salida rápida si no hay ningún fichaje abierto desde hace diez horas:
-- la mayoría de las horas no habrá nada, y no se gasta una invocación.
create or replace function atlas_disparar_fichajes() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_funciones_url o app.atlas_service_key; no se dispara el aviso de fichajes';
    return;
  end if;

  if not exists (
    select 1 from fichajes where fin is null and inicio < now() - interval '10 hours'
  ) then
    return;
  end if;

  perform net.http_post(
    url     := url || '/avisar',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{"fichajes": true}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- `create or replace` restaura el permiso de ejecución a PUBLIC. Sin estos
-- tres, cualquier autenticado la dispararía desde /rest/v1/rpc.
revoke all on function atlas_disparar_fichajes() from public;
revoke all on function atlas_disparar_fichajes() from anon;
revoke all on function atlas_disparar_fichajes() from authenticated;

-- Al minuto 41 de cada hora: ni en punto ni coincidiendo con el cobro (9:07)
-- ni con la materialización (6:13). pg_cron corre en UTC; para este aviso da
-- igual, porque se mide en horas transcurridas, no en hora del día.
-- `cron.schedule` reemplaza la tarea si el nombre ya existe: reaplicar la
-- migración no duplica nada.
select cron.schedule('atlas-fichajes', '41 * * * *',
                     $$select atlas_disparar_fichajes()$$);
