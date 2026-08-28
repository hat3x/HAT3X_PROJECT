--
-- El planificador vive DENTRO de Supabase, no en Vercel: así no depende de que
-- una función de Vercel esté despierta, y esquiva el límite de una ejecución
-- diaria del plan Hobby.
--

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- La URL y la clave se guardan como ajustes de la base para no incrustarlas en
-- la definición de la tarea, que cualquiera con acceso a `cron.job` podría leer.
-- Se fijan UNA vez, tras desplegar:
--   alter database postgres set app.atlas_funciones_url = 'https://xxxx.supabase.co/functions/v1';
--   alter database postgres set app.atlas_service_key   = '<service_role key>';
create or replace function atlas_disparar_vigia() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  -- Sin configurar, avisa y se calla. Si fallara, la tarea de cron dejaría un
  -- error cada minuto en el registro y acabaría tapando un problema de verdad.
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_funciones_url o app.atlas_service_key; no se dispara el vigia';
    return;
  end if;

  -- Salida rápida: si no hay ningún check que toque, no se gasta una invocación.
  if not exists (select 1 from checks where activo and proximo_check_en <= now()) then
    return;
  end if;

  perform net.http_post(
    url     := url || '/vigia',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

-- `cron.schedule` actualiza la tarea si el nombre ya existe, así que volver a
-- aplicar la migración no duplica nada.
select cron.schedule('atlas-vigia', '* * * * *', $$select atlas_disparar_vigia()$$);

-- La retención se programa aquí y su función se implementa en la Tarea 6.
-- A las 04:17 y no en punto a propósito: los minutos redondos concentran carga
-- de tareas programadas en cualquier sistema.
select cron.schedule('atlas-retencion', '17 4 * * *', $$select atlas_consolidar_retencion()$$);
