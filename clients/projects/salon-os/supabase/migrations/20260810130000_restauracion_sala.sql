-- =============================================================================
-- Kairos — Restauración · Sala (zonas + mesas + enlace con la cuenta)
-- =============================================================================
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'table_shape') then
    create type public.table_shape as enum ('round','square');
  end if;
  if not exists (select 1 from pg_type where typname = 'table_status') then
    create type public.table_status as enum ('libre','ocupada','cuenta_pedida','por_limpiar');
  end if;
end $$;

create table if not exists public.dining_zones (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(120) not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, name),
  constraint dining_zones_id_salon_key unique (id, salon_id)
);

create table if not exists public.dining_tables (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid not null references public.salons (id) on delete cascade,
  zone_id       uuid not null,
  name          varchar(60) not null,
  capacity_min  integer not null default 1 check (capacity_min >= 1),
  capacity_max  integer not null default 4 check (capacity_max >= 1),
  pos_x         numeric not null default 50,
  pos_y         numeric not null default 50,
  shape         public.table_shape not null default 'square',
  status        public.table_status not null default 'libre',
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint dining_tables_capacity_order check (capacity_max >= capacity_min),
  constraint dining_tables_zone_fkey
    foreign key (zone_id, salon_id) references public.dining_zones (id, salon_id) on delete cascade,
  unique (salon_id, name),
  constraint dining_tables_id_salon_key unique (id, salon_id)
);

alter table public.orders
  add column if not exists dining_table_id uuid,
  add column if not exists covers integer;
alter table public.orders
  add constraint orders_dining_table_id_fkey
    foreign key (dining_table_id, salon_id)
    references public.dining_tables (id, salon_id) on delete set null (dining_table_id);

create trigger trg_dining_zones_updated_at
  before update on public.dining_zones for each row execute function app.set_updated_at();
create trigger trg_dining_tables_updated_at
  before update on public.dining_tables for each row execute function app.set_updated_at();

create index if not exists idx_dining_tables_zone on public.dining_tables (zone_id);
create index if not exists idx_orders_dining_table on public.orders (dining_table_id);

alter table public.dining_zones  enable row level security;
alter table public.dining_tables enable row level security;

-- zonas: lectura miembros, gestión owner/manager
create policy "members_select_dining_zones" on public.dining_zones
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_dining_zones" on public.dining_zones
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_update_dining_zones" on public.dining_zones
  for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_delete_dining_zones" on public.dining_zones
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- mesas: lectura + UPDATE miembros (cambiar estado); INSERT/DELETE owner/manager (crear/quitar mesas)
create policy "members_select_dining_tables" on public.dining_tables
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_dining_tables" on public.dining_tables
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "members_update_dining_tables" on public.dining_tables
  for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));
create policy "managers_delete_dining_tables" on public.dining_tables
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_policies
    where schemaname = 'public' and tablename in ('dining_zones','dining_tables');
  if _cnt < 8 then
    raise exception 'GUARDIÁN SALA: faltan políticas (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN SALA: dining_zones/dining_tables verificadas';
end;
$guard$;

commit;
