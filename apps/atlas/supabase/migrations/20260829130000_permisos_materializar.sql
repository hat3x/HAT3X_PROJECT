-- apps/atlas/supabase/migrations/20260829130000_permisos_materializar.sql
--
-- Cierra las dos funciones de materialización.
--
-- Postgres concede EXECUTE a PUBLIC por defecto, y PostgREST expone en
-- /rest/v1/rpc toda función ejecutable del esquema. Como las dos son
-- `security definer`, se ejecutan como su dueño y SE SALTAN la seguridad de
-- fila: sin este revoke, un colaborador podría invocarlas y escribir en
-- `gastos` y en `periodos_contrato`, que son justo las tablas que la migración
-- de economía blindó para el propietario.
--
-- Nadie de la aplicación las llama. Las llama pg_cron, que corre como el dueño
-- y no necesita permiso concedido.
revoke all on function atlas_materializar_recurrentes(date) from public;
revoke all on function atlas_materializar_recurrentes(date) from anon;
revoke all on function atlas_materializar_recurrentes(date) from authenticated;

revoke all on function atlas_materializar_periodos(date) from public;
revoke all on function atlas_materializar_periodos(date) from anon;
revoke all on function atlas_materializar_periodos(date) from authenticated;
