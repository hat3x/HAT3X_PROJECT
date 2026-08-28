-- Perfiles, permisos por proyecto y el llavero cifrado.
-- Va antes que la migración de vigilancia porque `checks.credencial_id`
-- referencia a `credenciales`.

create table perfiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text,
  avatar_url     text,
  -- Propietario NO es un permiso por proyecto: es una condición de la persona.
  -- Por eso vive aquí y no en `permisos`.
  es_propietario boolean not null default false,
  tema           text not null default 'oscuro'
                 check (tema in ('claro','oscuro')),
  paleta         text not null default 'zafiro'
                 check (paleta in ('zafiro','nebulosa','oceano','grafito','crepusculo')),
  creado_en      timestamptz not null default now()
);

create table permisos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references perfiles(id)  on delete cascade,
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  rol         text not null check (rol in ('editor','lector')),
  creado_en   timestamptz not null default now(),
  unique (usuario_id, proyecto_id)
);
create index permisos_usuario on permisos(usuario_id);

create table credenciales (
  id              uuid primary key default gen_random_uuid(),
  proveedor       text not null,
  etiqueta        text not null,
  -- null = credencial global, no atada a un proyecto concreto
  proyecto_id     uuid references proyectos(id) on delete set null,
  -- AES-256-GCM. La clave maestra NUNCA vive aquí: está en ATLAS_MASTER_KEY,
  -- variable de entorno de Vercel. Robar el llavero exige comprometer los dos.
  secreto_cifrado bytea not null,
  iv              bytea not null,
  tag             bytea not null,
  -- Lo único legible: el prefijo enmascarado, para reconocerla en pantalla.
  prefijo         text,
  creado_en       timestamptz not null default now(),
  rotada_en       timestamptz
);
create index credenciales_proyecto on credenciales(proyecto_id);

create table credencial_usos (
  id            bigserial primary key,
  credencial_id uuid not null references credenciales(id) on delete cascade,
  usada_en      timestamptz not null default now(),
  contexto      text,
  usuario_id    uuid references perfiles(id) on delete set null
);
create index credencial_usos_credencial on credencial_usos(credencial_id, usada_en desc);

-- Referencia polimórfica (entidad_tipo + entidad_id) en lugar de dos columnas
-- con clave foránea: las notas se consultan siempre desde una entidad concreta,
-- nunca al revés, y dos tablas casi idénticas costarían más que la integridad
-- que se gana.
create table notas (
  id           uuid primary key default gen_random_uuid(),
  entidad_tipo text not null check (entidad_tipo in ('cliente','proyecto')),
  entidad_id   uuid not null,
  contenido    text not null,
  autor_id     uuid references perfiles(id) on delete set null,
  creado_en    timestamptz not null default now()
);
create index notas_entidad on notas(entidad_tipo, entidad_id, creado_en desc);
