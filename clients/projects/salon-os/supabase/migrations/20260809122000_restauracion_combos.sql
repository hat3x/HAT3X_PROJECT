-- =============================================================================
-- Kairos — Restauración · Combos (piezas de un producto combo + ruteo por pieza)
-- =============================================================================
begin;

create table if not exists public.combo_components (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid not null references public.salons (id) on delete cascade,
  combo_product_id      uuid not null,
  component_product_id  uuid not null,
  qty                   integer not null default 1 check (qty > 0),
  station_id_override   uuid,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  constraint combo_components_combo_fkey
    foreign key (combo_product_id, salon_id)
    references public.products (id, salon_id) on delete cascade,
  constraint combo_components_component_fkey
    foreign key (component_product_id, salon_id)
    references public.products (id, salon_id) on delete cascade,
  constraint combo_components_station_fkey
    foreign key (station_id_override, salon_id)
    references public.stations (id, salon_id) on delete set null (station_id_override),
  constraint combo_components_id_salon_key unique (id, salon_id)
);

alter table public.combo_components enable row level security;
create policy "members_select_combo_components" on public.combo_components
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_combo_components" on public.combo_components
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_update_combo_components" on public.combo_components
  for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_delete_combo_components" on public.combo_components
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_policies
    where schemaname = 'public' and tablename = 'combo_components';
  if _cnt < 4 then
    raise exception 'GUARDIÁN COMBOS: faltan políticas (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN COMBOS: combo_components verificada';
end;
$guard$;

commit;
