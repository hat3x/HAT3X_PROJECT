create table perfiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text not null default '',
  fecha_nacimiento date,
  sexo text check (sexo in ('hombre','mujer','no_indica')),
  altura_cm integer,
  unidades text not null default 'metrico',
  zona_horaria text not null default 'Europe/Madrid',
  corte_dia smallint not null default 4 check (corte_dia between 0 and 12),
  hora_silencio smallint not null default 22 check (hora_silencio between 0 and 23),
  creado_en timestamptz not null default now()
);

create table objetivos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  vigente_desde date not null,
  kcal integer not null,
  proteina_g integer not null,
  carbos_g integer not null,
  grasas_g integer not null,
  agua_ml integer not null,
  objetivo text not null,
  origen text not null check (origen in ('auto','manual')),
  creado_en timestamptz not null default now(),
  unique (user_id, vigente_desde)
);

create table alimentos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  nombre text not null,
  kcal_100 numeric not null,
  proteina_100 numeric not null default 0,
  carbos_100 numeric not null default 0,
  grasas_100 numeric not null default 0,
  codigo_barras text,
  origen text not null check (origen in ('off','propio')),
  ultima_cantidad_g numeric,
  creado_en timestamptz not null default now()
);
create index on alimentos (user_id, codigo_barras);

create table comidas (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  fecha_local date not null,
  momento text not null,
  registrado_en timestamptz not null default now()
);
create index on comidas (user_id, fecha_local);

create table comida_items (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  comida_id uuid not null references comidas on delete cascade,
  alimento_id uuid references alimentos on delete set null,
  nombre text not null,
  cantidad_g numeric not null,
  kcal numeric not null,
  proteina_g numeric not null,
  carbos_g numeric not null,
  grasas_g numeric not null,
  fuente text not null
);

create table registros_agua (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  fecha_local date not null,
  ml integer not null,
  registrado_en timestamptz not null default now()
);
create index on registros_agua (user_id, fecha_local);

create table entrenamientos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  fecha_local date not null,
  tipo text not null,
  duracion_min integer,
  intensidad smallint,
  notas text,
  registrado_en timestamptz not null default now()
);
create index on entrenamientos (user_id, fecha_local);

create table habitos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  nombre text not null,
  icono text,
  activo boolean not null default true,
  orden smallint not null default 0,
  hora_aviso smallint,
  hora_cierre smallint,
  avisos_activos boolean not null default false
);

create table habitos_registro (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  habito_id uuid not null references habitos on delete cascade,
  fecha_local date not null,
  hecho boolean not null default true,
  registrado_en timestamptz not null default now(),
  unique (habito_id, fecha_local)
);

create table pesos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  fecha_local date not null,
  kg numeric not null,
  unique (user_id, fecha_local)
);
