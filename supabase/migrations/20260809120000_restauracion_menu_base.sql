-- =============================================================================
-- Kairos — Restauración · Catálogo base (categorías, estaciones, extensión products)
-- Identificadores en inglés, comentarios en español. Dinero en céntimos.
-- FKs de dominio COMPUESTAS (fk_id, salon_id) → tabla(id, salon_id).
-- =============================================================================
begin;

-- Alérgenos: los 14 del Reglamento UE 1169/2011 (lista cerrada).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'allergen') then
    create type public.allergen as enum (
      'gluten','crustaceos','huevos','pescado','cacahuetes','soja','lacteos',
      'frutos_cascara','apio','mostaza','sesamo','sulfitos','altramuces','moluscos'
    );
  end if;
end $$;

-- Categorías de la carta.
create table if not exists public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(120) not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, name),
  constraint menu_categories_id_salon_key unique (id, salon_id)
);

-- Estaciones de producción (cocina, barra, plancha, ...).
create table if not exists public.stations (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(120) not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, name),
  constraint stations_id_salon_key unique (id, salon_id)
);

-- Extensión de products para restauración.
alter table public.products
  add column if not exists category_id uuid,
  add column if not exists station_id  uuid,
  add column if not exists is_combo     boolean not null default false,
  add column if not exists image_url    text,
  add column if not exists allergens    public.allergen[] not null default '{}',
  add column if not exists available_channels text[] not null default array['mostrador'];

alter table public.products
  add constraint products_category_id_fkey
    foreign key (category_id, salon_id)
    references public.menu_categories (id, salon_id) on delete set null (category_id),
  add constraint products_station_id_fkey
    foreign key (station_id, salon_id)
    references public.stations (id, salon_id) on delete set null (station_id);

create trigger trg_menu_categories_updated_at
  before update on public.menu_categories
  for each row execute function app.set_updated_at();
create trigger trg_stations_updated_at
  before update on public.stations
  for each row execute function app.set_updated_at();

-- RLS: lectura miembros / gestión owner-manager.
alter table public.menu_categories enable row level security;
alter table public.stations enable row level security;

create policy "members_select_menu_categories" on public.menu_categories
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_menu_categories" on public.menu_categories
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_update_menu_categories" on public.menu_categories
  for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_delete_menu_categories" on public.menu_categories
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "members_select_stations" on public.stations
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_stations" on public.stations
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_update_stations" on public.stations
  for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_delete_stations" on public.stations
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- Guardián: RLS habilitada + política SELECT de miembros presente.
do $guard$
declare _rls boolean; _cnt integer;
begin
  select relrowsecurity into _rls from pg_class where oid = 'public.menu_categories'::regclass;
  if not coalesce(_rls, false) then
    raise exception 'GUARDIÁN CARTA: RLS no habilitada en menu_categories' using errcode = 'raise_exception';
  end if;
  select count(*) into _cnt from pg_policies
    where schemaname = 'public' and tablename in ('menu_categories','stations')
      and cmd = 'SELECT';
  if _cnt < 2 then
    raise exception 'GUARDIÁN CARTA: faltan políticas SELECT (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN CARTA: menu_categories/stations verificadas';
end;
$guard$;

commit;
