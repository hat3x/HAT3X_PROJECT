-- =============================================================================
-- salon-os — Migración: sedes (locations)
--
-- Un salón (tenant) puede operar en varias sedes físicas. Los profesionales
-- pertenecen a una sede; el catálogo de servicios sigue siendo compartido a
-- nivel de salón (mismo precio/duración en todas las sedes).
--
-- Motivado por el caso real de "De Nueve a Nueve": mismo negocio, dos sedes
-- (Collado Villalba, Alpedrete), plantillas de empleados distintas por sede.
-- =============================================================================

-- ------------------------------------------------------------------------------
-- locations — sedes físicas de un salón
-- ------------------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(200) not null,
  slug        varchar(100) not null
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  address     text,
  phone       varchar(30),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, slug)
);

comment on table public.locations is 'Sedes físicas de un salón. El catálogo de servicios es compartido; los profesionales pertenecen a una sede.';

create index idx_locations_salon_id on public.locations (salon_id);

-- Para que el FK compuesto de professionals funcione, locations necesita una
-- clave única (id, salon_id) además de la PK simple sobre id:
alter table public.locations
  add constraint locations_id_salon_id_key unique (id, salon_id);

-- ------------------------------------------------------------------------------
-- professionals — vincular a su sede
--
-- Sin dato histórico en producción todavía (proyecto en desarrollo): se añade
-- NOT NULL directo, sin fase de backfill.
-- ------------------------------------------------------------------------------
alter table public.professionals
  add column location_id uuid;

alter table public.professionals
  alter column location_id set not null;

alter table public.professionals
  add constraint professionals_location_id_fkey
  foreign key (location_id, salon_id)
  references public.locations (id, salon_id) on delete cascade;

create index idx_professionals_location_id on public.professionals (location_id);

-- ------------------------------------------------------------------------------
-- RLS — mismo patrón que professionals (lectura: miembros; escritura: owner/manager).
-- La API pública de reserva usa el cliente admin (service role) y no depende
-- de estas políticas, igual que ya hace para salons/services.
-- ------------------------------------------------------------------------------
alter table public.locations enable row level security;

create policy "members_select_locations"
  on public.locations for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_locations"
  on public.locations for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_locations"
  on public.locations for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_locations"
  on public.locations for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
