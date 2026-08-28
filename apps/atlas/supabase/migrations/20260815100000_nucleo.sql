-- Modelo de dos ejes: clientes y proyectos no se contienen, se cruzan.

create extension if not exists pgcrypto;

-- Mantiene actualizado_en sin que la aplicación tenga que acordarse.
create or replace function tocar_actualizado_en() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------- eje comercial ----------
create table clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null unique,
  sector         text,
  estado         text not null default 'activo'
                 check (estado in ('activo','potencial','pausado','cerrado')),
  razon_social   text,
  cif            text,
  direccion      text,
  portada_url    text,
  color_acento   text,
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger clientes_tocar before update on clientes
  for each row execute function tocar_actualizado_en();

create table contactos (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  nombre       text not null,
  rol          text,
  email        text,
  telefono     text,
  es_principal boolean not null default false,
  creado_en    timestamptz not null default now()
);
create index contactos_cliente on contactos(cliente_id);

-- ---------- eje técnico ----------
create table proyectos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null unique,
  tipo           text not null
                 check (tipo in ('voz','chatbot','web-app','automatizacion',
                                 'producto-propio','interno')),
  estado         text not null default 'desarrollo'
                 check (estado in ('desarrollo','produccion','mantenimiento',
                                   'pausado','retirado')),
  descripcion    text,
  portada_url    text,
  -- Respaldo visual cuando no hay portada: la tarjeta se pinta con su gradiente
  -- en lugar de dejar un hueco gris.
  gradiente      text,
  stack          text[] not null default '{}',
  repo_url       text,
  ruta_repo      text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger proyectos_tocar before update on proyectos
  for each row execute function tocar_actualizado_en();

create table enlaces (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  etiqueta    text not null,
  url         text not null,
  tipo        text,
  orden       int not null default 0
);
create index enlaces_proyecto on enlaces(proyecto_id);

-- ---------- el cruce ----------
create table contratos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id)  on delete cascade,
  proyecto_id   uuid not null references proyectos(id) on delete cascade,
  cuota_mensual numeric(12,2),
  moneda        text not null default 'EUR',
  addons        text[] not null default '{}',
  alta          date not null,
  baja          date,
  estado        text not null default 'activo'
                check (estado in ('activo','pausado','finalizado')),
  notas         text,
  creado_en     timestamptz not null default now(),
  -- La fecha de alta entra en la clave para permitir el caso real de un cliente
  -- que se da de baja y vuelve más adelante con otras condiciones.
  unique (cliente_id, proyecto_id, alta),
  check (baja is null or baja >= alta)
);
create index contratos_cliente  on contratos(cliente_id);
create index contratos_proyecto on contratos(proyecto_id);
