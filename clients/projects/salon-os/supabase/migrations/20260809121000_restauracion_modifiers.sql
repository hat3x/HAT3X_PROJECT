-- =============================================================================
-- Kairos — Restauración · Modificadores (grupos, opciones, asignación a producto)
-- =============================================================================
begin;

create table if not exists public.modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(120) not null,
  min_select  integer not null default 0 check (min_select >= 0),
  max_select  integer not null default 1 check (max_select >= 1),
  required    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint modifier_groups_min_le_max check (min_select <= max_select),
  constraint modifier_groups_id_salon_key unique (id, salon_id)
);

create table if not exists public.modifiers (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null references public.salons (id) on delete cascade,
  group_id          uuid not null,
  name              varchar(120) not null,
  price_delta_cents integer not null default 0,   -- puede ser negativo (descuento)
  sort_order        integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint modifiers_group_id_fkey
    foreign key (group_id, salon_id)
    references public.modifier_groups (id, salon_id) on delete cascade,
  constraint modifiers_id_salon_key unique (id, salon_id)
);

create table if not exists public.product_modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  product_id  uuid not null,
  group_id    uuid not null,
  sort_order  integer not null default 0,
  constraint product_modifier_groups_product_fkey
    foreign key (product_id, salon_id)
    references public.products (id, salon_id) on delete cascade,
  constraint product_modifier_groups_group_fkey
    foreign key (group_id, salon_id)
    references public.modifier_groups (id, salon_id) on delete cascade,
  unique (salon_id, product_id, group_id),
  constraint product_modifier_groups_id_salon_key unique (id, salon_id)
);

create trigger trg_modifier_groups_updated_at
  before update on public.modifier_groups
  for each row execute function app.set_updated_at();
create trigger trg_modifiers_updated_at
  before update on public.modifiers
  for each row execute function app.set_updated_at();

-- RLS (patrón: lectura miembros / gestión owner-manager) para las tres tablas.
do $$
declare t text;
begin
  foreach t in array array['modifier_groups','modifiers','product_modifier_groups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "members_select_%1$s" on public.%1$I
      for select to authenticated using (salon_id in (select app.user_salon_ids()))$p$, t);
    execute format($p$create policy "managers_insert_%1$s" on public.%1$I
      for insert to authenticated
      with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))$p$, t);
    execute format($p$create policy "managers_update_%1$s" on public.%1$I
      for update to authenticated
      using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
      with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))$p$, t);
    execute format($p$create policy "managers_delete_%1$s" on public.%1$I
      for delete to authenticated
      using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))$p$, t);
  end loop;
end $$;

do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_policies
    where schemaname = 'public'
      and tablename in ('modifier_groups','modifiers','product_modifier_groups');
  if _cnt < 12 then
    raise exception 'GUARDIÁN MODIFICADORES: faltan políticas (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN MODIFICADORES: 3 tablas verificadas';
end;
$guard$;

commit;
