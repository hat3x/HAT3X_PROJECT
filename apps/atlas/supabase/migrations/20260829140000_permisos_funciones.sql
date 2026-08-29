-- apps/atlas/supabase/migrations/20260829140000_permisos_funciones.sql
--
-- Cierra cinco funciones anteriores a esta rama que se quedaron sin el REVOKE
-- que sí llevan las de materializar (20260829130000_permisos_materializar.sql).
--
-- La cadena completa: Postgres concede EXECUTE a PUBLIC por defecto en toda
-- función nueva; PostgREST expone en /rest/v1/rpc cualquier función del
-- esquema `public` que el rol de la petición pueda ejecutar; y como las cinco
-- son `security definer`, ejecutarlas SALTA la seguridad de fila y corre como
-- el dueño de la función. Sin este revoke, cualquier colaborador autenticado
-- podía invocarlas desde fuera de la aplicación — dos de ellas (retención y
-- poda de descubrimientos) borran datos.
--
-- No las llama la aplicación. Las llama pg_cron (ver planificador.sql,
-- retencion.sql, planificar_avisos.sql y descubridor.sql), que corre como el
-- dueño de la base y no necesita permiso concedido vía GRANT.
--
-- No se editan las migraciones ya aplicadas: revocar aquí, en una migración
-- nueva, es el único cambio seguro sobre una base que ya las ejecutó.

revoke all on function atlas_disparar_vigia() from public;
revoke all on function atlas_disparar_vigia() from anon;
revoke all on function atlas_disparar_vigia() from authenticated;

revoke all on function atlas_consolidar_retencion() from public;
revoke all on function atlas_consolidar_retencion() from anon;
revoke all on function atlas_consolidar_retencion() from authenticated;

revoke all on function atlas_disparar_avisos() from public;
revoke all on function atlas_disparar_avisos() from anon;
revoke all on function atlas_disparar_avisos() from authenticated;

revoke all on function atlas_podar_descubrimientos() from public;
revoke all on function atlas_podar_descubrimientos() from anon;
revoke all on function atlas_podar_descubrimientos() from authenticated;

revoke all on function atlas_disparar_descubridor() from public;
revoke all on function atlas_disparar_descubridor() from anon;
revoke all on function atlas_disparar_descubridor() from authenticated;
