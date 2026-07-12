-- =============================================================================
-- salon-os — Migración 2/3: políticas RLS multi-tenant
--
-- Modelo: el aislamiento de tenant se resuelve vía salon_members.
-- Las funciones helper son SECURITY DEFINER en el esquema `app` para evitar
-- recursión RLS sobre salon_members y se marcan STABLE para que el planner
-- las evalúe una sola vez por consulta (initPlan con `(select ...)`).
-- =============================================================================

-- ------------------------------------------------------------------------------
-- Funciones helper
-- ------------------------------------------------------------------------------

-- Salones a los que pertenece el usuario autenticado
create or replace function app.user_salon_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select salon_id
  from public.salon_members
  where user_id = (select auth.uid());
$$;

-- ¿Tiene el usuario alguno de estos roles en el salón?
create or replace function app.has_salon_role(
  _salon_id uuid,
  _roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.salon_members m
    where m.salon_id = _salon_id
      and m.user_id = (select auth.uid())
      and m.role = any (_roles)
  );
$$;

revoke execute on function app.user_salon_ids() from anon, public;
revoke execute on function app.has_salon_role(uuid, public.member_role[]) from anon, public;
grant execute on function app.user_salon_ids() to authenticated;
grant execute on function app.has_salon_role(uuid, public.member_role[]) to authenticated;

-- ------------------------------------------------------------------------------
-- Activar RLS en todas las tablas (deny-by-default)
-- ------------------------------------------------------------------------------
alter table public.salons                enable row level security;
alter table public.salon_members         enable row level security;
alter table public.services              enable row level security;
alter table public.professionals         enable row level security;
alter table public.professional_services enable row level security;
alter table public.customers             enable row level security;
alter table public.appointments          enable row level security;
alter table public.visits                enable row level security;

-- ------------------------------------------------------------------------------
-- salons
-- ------------------------------------------------------------------------------
create policy "members_select_own_salons"
  on public.salons for select to authenticated
  using (id in (select app.user_salon_ids()));

-- Cualquier usuario autenticado puede crear un salón (se convierte en owner
-- vía trigger, ver más abajo)
create policy "authenticated_insert_salon"
  on public.salons for insert to authenticated
  with check (true);

create policy "owners_update_salon"
  on public.salons for update to authenticated
  using (app.has_salon_role(id, array['owner']::public.member_role[]))
  with check (app.has_salon_role(id, array['owner']::public.member_role[]));

create policy "owners_delete_salon"
  on public.salons for delete to authenticated
  using (app.has_salon_role(id, array['owner']::public.member_role[]));

-- Al crear un salón, el creador se registra automáticamente como owner
create or replace function app.register_salon_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Con service role / seeds no hay usuario: no se crea membresía automática
  if (select auth.uid()) is not null then
    insert into public.salon_members (salon_id, user_id, role)
    values (new.id, (select auth.uid()), 'owner');
  end if;
  return new;
end;
$$;

create trigger trg_salons_register_owner
  after insert on public.salons
  for each row
  when (new.id is not null)
  execute function app.register_salon_owner();

-- ------------------------------------------------------------------------------
-- salon_members
-- ------------------------------------------------------------------------------
create policy "members_select_memberships"
  on public.salon_members for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "owners_managers_insert_members"
  on public.salon_members for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "owners_managers_update_members"
  on public.salon_members for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "owners_delete_members"
  on public.salon_members for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- services — lectura: cualquier miembro; escritura: owner/manager
-- ------------------------------------------------------------------------------
create policy "members_select_services"
  on public.services for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_services"
  on public.services for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_services"
  on public.services for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_services"
  on public.services for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- professionals — lectura: miembros; escritura: owner/manager
-- ------------------------------------------------------------------------------
create policy "members_select_professionals"
  on public.professionals for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_professionals"
  on public.professionals for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_professionals"
  on public.professionals for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_professionals"
  on public.professionals for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- professional_services — lectura: miembros; escritura: owner/manager
-- ------------------------------------------------------------------------------
create policy "members_select_professional_services"
  on public.professional_services for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_professional_services"
  on public.professional_services for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_professional_services"
  on public.professional_services for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- customers — todo el personal del salón gestiona clientes
-- ------------------------------------------------------------------------------
create policy "members_select_customers"
  on public.customers for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "members_insert_customers"
  on public.customers for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

create policy "members_update_customers"
  on public.customers for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

-- Borrado solo owner/manager (RGPD: derecho de supresión, con control)
create policy "managers_delete_customers"
  on public.customers for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- appointments — todo el personal gestiona citas de su salón
-- ------------------------------------------------------------------------------
create policy "members_select_appointments"
  on public.appointments for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "members_insert_appointments"
  on public.appointments for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

create policy "members_update_appointments"
  on public.appointments for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

create policy "managers_delete_appointments"
  on public.appointments for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- visits — registro casi inmutable: sin UPDATE; DELETE solo owner
-- ------------------------------------------------------------------------------
create policy "members_select_visits"
  on public.visits for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

-- Inserción manual (walk-ins); la automática la hace el trigger SECURITY DEFINER
create policy "members_insert_visits"
  on public.visits for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

create policy "owners_delete_visits"
  on public.visits for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner']::public.member_role[]));
