--
-- Programar los avisos. Sin esto, `avisar` solo se ejecuta si alguien la llama
-- a mano: las caídas se detectaban cada minuto y no salía ni un aviso solo.
--
-- El plan 1C pedía esta migración con fecha 20260816100000, pero ese hueco lo
-- ocupó `vista_resumen` y la de avisos se quedó sin escribir. El vigía sí
-- estaba programado, así que la mitad que se ve —el registro de incidencias—
-- funcionaba, y la que no se ve —el aviso— no.
--
-- Va aparte del vigía a propósito: comprobar servicios no debe quedarse
-- esperando a un servidor de correo.
--

create or replace function atlas_disparar_avisos() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  -- Sin configurar, avisa y se calla. Si fallara, la tarea dejaría un error cada
  -- minuto en el registro y acabaría tapando un problema de verdad.
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_funciones_url o app.atlas_service_key; no se disparan los avisos';
    return;
  end if;

  -- Salida rápida: si no hay nada pendiente, no se gasta una invocación.
  --
  -- Los DOS sellos, no solo el primero. Con `notificada_en is null` a secas, una
  -- incidencia ya avisada y luego cerrada no contaría como pendiente y la
  -- recuperación no se dispararía nunca.
  if not exists (
    select 1 from incidencias
     where notificada_en is null
        or (cerrada_en is not null and recuperacion_notificada_en is null)
  ) then
    return;
  end if;

  perform net.http_post(
    url     := url || '/avisar',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

-- `cron.schedule` actualiza la tarea si el nombre ya existe: reaplicar la
-- migración no duplica nada.
select cron.schedule('atlas-avisos', '* * * * *', $$select atlas_disparar_avisos()$$);
