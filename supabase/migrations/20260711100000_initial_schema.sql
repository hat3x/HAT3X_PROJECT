-- =============================================================================
-- salon-os — Migración 1/3: esquema inicial multi-tenant
-- Tenant raíz: salons. Toda tabla de dominio lleva salon_id (FK indexada).
-- =============================================================================

-- Extensiones -----------------------------------------------------------------
create extension if not exists "pgcrypto";    -- gen_random_uuid()
create extension if not exists "btree_gist";  -- exclusion constraint anti-solape

-- Esquema interno para helpers (no expuesto por PostgREST) ---------------------
create schema if not exists app;
grant usage on schema app to authenticated;

-- Enums ------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'manager', 'staff');

create type public.appointment_status as enum (
  'pending',     -- solicitada, sin confirmar
  'confirmed',   -- confirmada por el salón
  'completed',   -- realizada (genera visita automáticamente)
  'cancelled',   -- cancelada por cliente o salón
  'no_show'      -- el cliente no se presentó
);

-- ------------------------------------------------------------------------------
-- salons — raíz del tenant
-- ------------------------------------------------------------------------------
create table public.salons (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(200) not null,
  slug        varchar(100) not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone    text not null default 'Europe/Madrid',
  phone       varchar(30),
  email       varchar(255),
  address     text,
  settings    jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.salons is 'Tenant raíz. Cada salón es un tenant aislado por RLS.';

-- ------------------------------------------------------------------------------
-- salon_members — vincula auth.users con salones y su rol (base del RLS)
-- ------------------------------------------------------------------------------
create table public.salon_members (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'staff',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, user_id)
);

create index idx_salon_members_user_id  on public.salon_members (user_id);
create index idx_salon_members_salon_id on public.salon_members (salon_id);

comment on table public.salon_members is 'Membresía usuario↔salón. Fuente de verdad para las políticas RLS.';

-- ------------------------------------------------------------------------------
-- services — catálogo de servicios por salón
-- ------------------------------------------------------------------------------
create table public.services (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null references public.salons (id) on delete cascade,
  name              varchar(200) not null,
  description       text,
  category          varchar(100),
  duration_minutes  integer not null check (duration_minutes between 5 and 600),
  price_cents       integer not null default 0 check (price_cents >= 0),
  currency          char(3) not null default 'EUR',
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (salon_id, name)
);

create index idx_services_salon_id on public.services (salon_id);
-- Consulta habitual: catálogo activo de un salón
create index idx_services_salon_active on public.services (salon_id, name)
  where active;

-- ------------------------------------------------------------------------------
-- professionals — profesionales del salón (opcionalmente con cuenta propia)
-- ------------------------------------------------------------------------------
create table public.professionals (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  full_name    varchar(200) not null,
  email        varchar(255),
  phone        varchar(30),
  specialties  text[] not null default '{}',
  color        varchar(7) check (color ~ '^#[0-9a-fA-F]{6}$'), -- color de agenda
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_professionals_salon_id on public.professionals (salon_id);
create index idx_professionals_user_id  on public.professionals (user_id)
  where user_id is not null;

-- ------------------------------------------------------------------------------
-- professional_services — qué servicios presta cada profesional (N:M)
-- ------------------------------------------------------------------------------
create table public.professional_services (
  professional_id  uuid not null references public.professionals (id) on delete cascade,
  service_id       uuid not null references public.services (id) on delete cascade,
  salon_id         uuid not null references public.salons (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (professional_id, service_id)
);

create index idx_professional_services_service_id on public.professional_services (service_id);
create index idx_professional_services_salon_id   on public.professional_services (salon_id);

-- ------------------------------------------------------------------------------
-- customers — clientes finales del salón (no son usuarios de auth)
-- ------------------------------------------------------------------------------
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  salon_id           uuid not null references public.salons (id) on delete cascade,
  full_name          varchar(200) not null,
  email              varchar(255),
  phone              varchar(30),
  birth_date         date,
  notes              text,
  marketing_consent  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_customers_salon_id on public.customers (salon_id);
-- Email único por salón (permite el mismo email en salones distintos)
create unique index idx_customers_salon_email on public.customers (salon_id, lower(email))
  where email is not null;
create index idx_customers_salon_phone on public.customers (salon_id, phone)
  where phone is not null;

-- ------------------------------------------------------------------------------
-- appointments — citas
-- ------------------------------------------------------------------------------
create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null references public.salons (id) on delete cascade,
  customer_id      uuid not null references public.customers (id) on delete restrict,
  professional_id  uuid not null references public.professionals (id) on delete restrict,
  service_id       uuid not null references public.services (id) on delete restrict,
  status           public.appointment_status not null default 'pending',
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  -- Snapshot del precio en el momento de reservar (el catálogo puede cambiar)
  price_cents      integer not null default 0 check (price_cents >= 0),
  currency         char(3) not null default 'EUR',
  notes            text,
  cancelled_reason text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index idx_appointments_salon_starts on public.appointments (salon_id, starts_at desc);
create index idx_appointments_customer_id  on public.appointments (customer_id);
create index idx_appointments_professional_starts
  on public.appointments (professional_id, starts_at);
create index idx_appointments_service_id   on public.appointments (service_id);
-- Agenda del día: filtro habitual por estado activo
create index idx_appointments_salon_status_starts
  on public.appointments (salon_id, status, starts_at)
  where status in ('pending', 'confirmed');

-- Un profesional no puede tener dos citas activas solapadas
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (status in ('pending', 'confirmed'));

-- ------------------------------------------------------------------------------
-- visits — visitas realizadas (histórico de negocio, base de fidelización)
-- ------------------------------------------------------------------------------
create table public.visits (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null references public.salons (id) on delete cascade,
  appointment_id   uuid unique references public.appointments (id) on delete set null,
  customer_id      uuid not null references public.customers (id) on delete restrict,
  professional_id  uuid references public.professionals (id) on delete set null,
  service_id       uuid references public.services (id) on delete set null,
  service_name     varchar(200) not null,  -- snapshot: el servicio puede borrarse
  amount_cents     integer not null default 0 check (amount_cents >= 0),
  currency         char(3) not null default 'EUR',
  visited_at       timestamptz not null default now(),
  notes            text,
  created_at       timestamptz not null default now()
);

create index idx_visits_salon_visited   on public.visits (salon_id, visited_at desc);
create index idx_visits_customer_id     on public.visits (customer_id);
create index idx_visits_professional_id on public.visits (professional_id)
  where professional_id is not null;

comment on table public.visits is
  'Registro inmutable de visitas realizadas. Se crea automáticamente al completar una cita (trigger) o manualmente para walk-ins.';

-- ------------------------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_salons_updated_at
  before update on public.salons
  for each row execute function app.set_updated_at();

create trigger trg_salon_members_updated_at
  before update on public.salon_members
  for each row execute function app.set_updated_at();

create trigger trg_services_updated_at
  before update on public.services
  for each row execute function app.set_updated_at();

create trigger trg_professionals_updated_at
  before update on public.professionals
  for each row execute function app.set_updated_at();

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function app.set_updated_at();

create trigger trg_appointments_updated_at
  before update on public.appointments
  for each row execute function app.set_updated_at();
