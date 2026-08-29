-- apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql
--
-- El aviso diario de cobro.
--
-- `notificaciones` nació atada a `incidencias`, con su `incidencia_id`. Un
-- aviso de cobro no tiene incidencia, así que ese campo va nulo — pero
-- entonces el historial no sabría de qué era cada fila. Por eso una columna
-- `tipo`.
alter table notificaciones
  add column tipo text not null default 'incidencia'
    check (tipo in ('incidencia','cobro'));

-- Las que ya existen son todas de incidencia, que es lo que dice el `default`.
-- Se deja el default puesto para que el código del bloque 1 no tenga que
-- cambiar: sigue insertando sin nombrar la columna y sigue siendo correcto.

-- El candado del día: sirve a la consulta «¿ya avisé hoy de cobro?», que es lo
-- único que impide mandar el mismo resumen dos veces si el cron se dispara dos
-- veces.
create index notificaciones_cobro_del_dia
  on notificaciones(usuario_id, enviada_en desc) where tipo = 'cobro';

-- ---------- el disparo ----------
--
-- Reutiliza la MISMA Edge Function que los avisos de incidencia, `avisar`, con
-- un cuerpo distinto. Escribir una función nueva habría obligado a copiar
-- `push.ts` y `correo.ts`, y dos copias del envío divergen siempre.
create or replace function atlas_disparar_cobro() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  -- Sin configurar, avisa y se calla, igual que el resto de disparadores: un
  -- error diario en el registro de cron acabaría tapando un problema de
  -- verdad.
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_funciones_url o app.atlas_service_key; no se dispara el cobro';
    return;
  end if;

  perform net.http_post(
    url     := url || '/avisar',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{"cobro": true}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- Cualquier `security definer` sin revoke queda expuesta en /rest/v1/rpc a
-- cualquier autenticado, y al ejecutarse como su dueño se salta RLS.
revoke all on function atlas_disparar_cobro() from public;
revoke all on function atlas_disparar_cobro() from anon;
revoke all on function atlas_disparar_cobro() from authenticated;

-- A las 9:07 de la mañana. Ni de madrugada, porque un aviso que se lee doce
-- horas después es un aviso perdido; ni en punto, porque los minutos redondos
-- concentran carga de tareas programadas.
select cron.schedule('atlas-cobro', '7 9 * * *',
                     $$select atlas_disparar_cobro()$$);
