-- Quitar al rol anónimo todo acceso a las tablas y al almacenamiento.
--
-- La migración 0002 concedía a `authenticated` y decía explícitamente que a
-- `anon` no se le concede nada. Eso se cumplía en local, donde el CLI de
-- Supabase no expone automáticamente las tablas nuevas de `public`. **En la
-- nube sí las expone**, así que `anon` heredó `select` y la intención del
-- diseño no llegó a cumplirse donde importa.
--
-- Comprobado contra el proyecto real antes de escribir esto: una lectura
-- anónima de `pesos` devolvía HTTP 200 con lista vacía —RLS filtrando— en
-- lugar de «permission denied». No había fuga, porque la política aguanta,
-- pero quedaba una sola capa de defensa donde el diseño pedía dos: el
-- privilegio de tabla decide si el rol puede tocarla, la política decide qué
-- filas ve. Perder la primera significa que un fallo en la segunda ya no
-- tiene red.
--
-- Esta app no tiene ninguna superficie anónima: el registro y el inicio de
-- sesión van por GoTrue, no por PostgREST, y el perfil lo crea un trigger
-- `security definer`. Revocar no rompe ningún camino.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;

-- Y que las tablas que cree cualquier migración futura tampoco lo hereden.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
