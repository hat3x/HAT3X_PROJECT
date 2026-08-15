create table servicios (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  -- OPCIONAL, y es la decisión que sostiene el modelo: cuando un servicio es de
  -- un cliente concreto, la alerta sabe a quién afecta comercialmente. Si el
  -- cliente desaparece, el servicio sigue siendo del proyecto.
  cliente_id  uuid references clientes(id) on delete set null,
  nombre      text not null,
  tipo        text not null
              check (tipo in ('web','api','webhook','workflow','agente-voz',
                              'telefonia','base-datos','cron','dominio','otro')),
  proveedor   text,
  activo      boolean not null default true,
  orden       int not null default 0,
  creado_en   timestamptz not null default now()
);
create index servicios_proyecto on servicios(proyecto_id);
create index servicios_cliente  on servicios(cliente_id);

create table checks (
  id                  uuid primary key default gen_random_uuid(),
  servicio_id         uuid not null references servicios(id) on delete cascade,
  tipo                text not null check (tipo in ('http','ssl','dns','tcp')),
  url                 text,
  metodo              text not null default 'GET',
  cabeceras           jsonb,
  cuerpo              text,
  credencial_id       uuid references credenciales(id) on delete set null,
  espera_status       int[] not null default '{200}',
  -- Distingue «el servidor responde» de «la aplicación funciona»: una web rota
  -- puede devolver 200 con una página de error.
  espera_texto        text,
  timeout_ms          int  not null default 10000,
  intervalo_s         int  not null default 300,
  umbral_fallos       int  not null default 3,
  umbral_latencia_ms  int,
  notifica            boolean not null default true,
  activo              boolean not null default true,
  ultimo_check_en     timestamptz,
  proximo_check_en    timestamptz not null default now(),
  fallos_consecutivos int not null default 0,
  estado              text not null default 'desconocido'
                      check (estado in ('ok','degradado','caido','desconocido')),
  creado_en           timestamptz not null default now(),
  check (intervalo_s >= 60),
  check (timeout_ms between 1000 and 60000),
  check (umbral_fallos >= 1)
);
create index checks_servicio on checks(servicio_id);
-- El índice que ejecuta el planificador cada minuto.
create index checks_pendientes on checks(proximo_check_en) where activo;

create table check_resultados (
  id          bigserial primary key,
  check_id    uuid not null references checks(id) on delete cascade,
  ts          timestamptz not null default now(),
  ok          boolean not null,
  latencia_ms int,
  status_code int,
  error       text
);
create index check_resultados_check on check_resultados(check_id, ts desc);

create table check_agregados (
  check_id      uuid not null references checks(id) on delete cascade,
  bucket        timestamptz not null,
  granularidad  text not null check (granularidad in ('hora','dia')),
  total         int not null,
  ok            int not null,
  latencia_p50  int,
  latencia_p95  int,
  primary key (check_id, bucket, granularidad)
);

create table incidencias (
  id               uuid primary key default gen_random_uuid(),
  servicio_id      uuid not null references servicios(id) on delete cascade,
  check_id         uuid not null references checks(id)    on delete cascade,
  abierta_en       timestamptz not null default now(),
  cerrada_en       timestamptz,
  -- 'critica' = el check pasó a caido. 'aviso' = caducidad próxima (ssl/dns).
  -- El estado 'degradado' NO genera incidencia, solo se pinta.
  severidad        text not null check (severidad in ('critica','aviso')),
  causa            text,
  ultimo_error     text,
  -- «Silenciar hasta resolver» se guarda como 'infinity': cuando la incidencia
  -- se cierra, deja de aplicar de todos modos.
  silenciada_hasta timestamptz,
  notificada_en    timestamptz,
  check (cerrada_en is null or cerrada_en >= abierta_en)
);
-- Como mucho una incidencia abierta por check. Esta restricción es lo que
-- impide que un fallo intermitente genere una avalancha de incidencias.
create unique index incidencias_abierta_por_check
  on incidencias(check_id) where cerrada_en is null;
create index incidencias_servicio on incidencias(servicio_id, abierta_en desc);

create table ventanas_mantenimiento (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  desde       timestamptz not null,
  hasta       timestamptz not null,
  motivo      text,
  creado_en   timestamptz not null default now(),
  check (hasta > desde)
);
create index ventanas_proyecto on ventanas_mantenimiento(proyecto_id, desde, hasta);

create table suscripciones_push (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references perfiles(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  dispositivo  text,
  creada_en    timestamptz not null default now(),
  ultima_ok_en timestamptz
);
create index suscripciones_usuario on suscripciones_push(usuario_id);

create table notificaciones (
  id            bigserial primary key,
  usuario_id    uuid not null references perfiles(id)    on delete cascade,
  incidencia_id uuid          references incidencias(id) on delete cascade,
  canal         text not null check (canal in ('push','email')),
  enviada_en    timestamptz not null default now(),
  ok            boolean not null,
  error         text
);
create index notificaciones_usuario on notificaciones(usuario_id, enviada_en desc);
