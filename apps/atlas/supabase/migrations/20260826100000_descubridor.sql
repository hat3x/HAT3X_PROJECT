--
-- El descubridor de tenants de Kairos: su registro y su arranque.
--
-- A diferencia del vigía y de los avisos, este NO corre en una Edge Function.
-- Corre en la aplicación, en `/api/descubrir`, y pg_cron solo lo despierta.
--
-- El motivo: el descubridor descifra la clave de servicio de Kairos del llavero,
-- y eso es lo más delicado que hace Atlas. En la aplicación reutiliza
-- `usarCredencial`, que ya deja rastro en `credencial_usos`; reimplementarlo en
-- Deno serían dos copias del código de cifrado y un registro de usos que se
-- olvidaría de escribir.
--
-- Lo que se pierde a cambio: si Vercel está caído, se salta una pasada. Es
-- asumible — el vigía sigue vigilando por su cuenta, y una reconciliación
-- perdida se recupera sola a la hora siguiente. El vigía no podría permitírselo:
-- él tiene que funcionar precisamente cuando lo demás no funciona.
--

-- ---------- el registro ----------
--
-- Sin esto, un descubridor que lleva semanas fallando no se nota: la ruta
-- devuelve un 500 a pg_net, y pg_net no se lo cuenta a nadie. Aquí queda escrito
-- qué pasó en cada pasada, incluido el motivo cuando salió mal.
create table descubrimientos (
  id           bigserial primary key,
  ejecutado_en timestamptz not null default now(),
  ok           boolean not null,
  altas        int not null default 0,
  pausados     int not null default 0,
  reactivados  int not null default 0,
  -- Nulo cuando `ok`. Lleva el mensaje tal cual lo devolvió el descubridor: es
  -- lo único que quedará para entender por qué no se reconcilió nada.
  error        text
);
create index descubrimientos_recientes on descubrimientos(ejecutado_en desc);

-- Los `grant` generales de `20260815100300_rls.sql` solo alcanzaron a las tablas
-- que existían entonces. Una tabla nueva empieza sin permisos para nadie.
grant select on descubrimientos to authenticated;
grant all privileges on descubrimientos to service_role;
grant usage, select on sequence descubrimientos_id_seq to authenticated;
grant all privileges on sequence descubrimientos_id_seq to service_role;

alter table descubrimientos enable row level security;

-- Solo el propietario. Cuenta qué clientes entraron y salieron del censo de
-- Kairos, que es información del negocio y no de un proyecto concreto.
create policy descubrimientos_ver on descubrimientos for select to authenticated
  using (atlas_es_propietario());

-- ---------- la retención ----------
--
-- Una pasada por hora son ~8.800 filas al año: poco, pero no cero, y una tabla
-- de registro sin poda acaba siendo la que sobra en el peor momento.
create or replace function atlas_podar_descubrimientos() returns void
language sql security definer set search_path = public as $$
  delete from descubrimientos where ejecutado_en < now() - interval '180 days'
$$;

-- ---------- el arranque ----------
--
-- Los mismos ajustes de base que usa `atlas_disparar_vigia`, más dos propios.
-- Se fijan UNA vez, tras desplegar:
--   alter database postgres set app.atlas_web_url  = 'https://atlas.hat3x.com';
--   alter database postgres set app.atlas_cron_key = '<ATLAS_CRON_KEY>';
--
-- `atlas_cron_key` es un secreto propio y NO la service_role de Supabase: la
-- ruta vive en Vercel, y mandar la llave maestra de la base a un dominio de
-- fuera en cada pasada amplía el radio de un descuido sin necesidad.
create or replace function atlas_disparar_descubridor() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_web_url', true);
  clave text := current_setting('app.atlas_cron_key', true);
begin
  -- Sin configurar, avisa y se calla, igual que el vigía: un error cada hora en
  -- el registro de cron acabaría tapando un problema de verdad.
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_web_url o app.atlas_cron_key; no se dispara el descubridor';
    return;
  end if;

  perform net.http_post(
    url     := url || '/api/descubrir',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{}'::jsonb,
    -- Más largo que el del vigía: aquí puede haber un arranque en frío de Vercel
    -- por delante, y una pasada que dé de alta veinte salones detrás.
    timeout_milliseconds := 60000
  );
end $$;

-- Cada hora al minuto 23, y no en punto: los minutos redondos concentran carga
-- de tareas programadas en cualquier sistema. Una hora basta de sobra — dar de
-- alta un salón en Kairos no exige que Atlas lo vigile en el mismo minuto.
select cron.schedule('atlas-descubrir', '23 * * * *',
                     $$select atlas_disparar_descubridor()$$);

select cron.schedule('atlas-podar-descubrimientos', '41 4 * * *',
                     $$select atlas_podar_descubrimientos()$$);
