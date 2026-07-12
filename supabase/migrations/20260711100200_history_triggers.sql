-- =============================================================================
-- salon-os — Migración 3/3: historial y triggers de auditoría
--
-- 1. appointment_history: auditoría completa de citas (INSERT/UPDATE/DELETE).
-- 2. customer_history: auditoría de cambios en fichas de cliente (RGPD).
-- 3. Auto-visita: al pasar una cita a 'completed' se crea la visita.
--
-- Los triggers son SECURITY DEFINER: escriben en tablas de historial que no
-- tienen política de INSERT para usuarios (inmutables desde el cliente).
-- =============================================================================

-- ------------------------------------------------------------------------------
-- appointment_history
-- ------------------------------------------------------------------------------
create table public.appointment_history (
  id              bigint generated always as identity primary key,
  appointment_id  uuid not null,   -- sin FK: conserva historial tras DELETE
  salon_id        uuid not null,
  action          text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by      uuid,            -- auth.uid() del autor del cambio
  old_data        jsonb,
  new_data        jsonb,
  changed_at      timestamptz not null default now()
);

create index idx_appointment_history_appointment
  on public.appointment_history (appointment_id, changed_at desc);
create index idx_appointment_history_salon
  on public.appointment_history (salon_id, changed_at desc);

alter table public.appointment_history enable row level security;

-- Solo lectura para miembros; la escritura ocurre exclusivamente vía trigger
create policy "members_select_appointment_history"
  on public.appointment_history for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

comment on table public.appointment_history is
  'Auditoría inmutable de citas. Escritura solo vía trigger SECURITY DEFINER.';

-- ------------------------------------------------------------------------------
-- customer_history
-- ------------------------------------------------------------------------------
create table public.customer_history (
  id           bigint generated always as identity primary key,
  customer_id  uuid not null,
  salon_id     uuid not null,
  action       text not null check (action in ('UPDATE', 'DELETE')),
  changed_by   uuid,
  old_data     jsonb,
  new_data     jsonb,
  changed_at   timestamptz not null default now()
);

create index idx_customer_history_customer
  on public.customer_history (customer_id, changed_at desc);
create index idx_customer_history_salon
  on public.customer_history (salon_id, changed_at desc);

alter table public.customer_history enable row level security;

-- Historial de clientes: solo owner/manager (contiene datos personales previos)
create policy "managers_select_customer_history"
  on public.customer_history for select to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- Trigger: auditoría de appointments
-- ------------------------------------------------------------------------------
create or replace function app.log_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_history
      (appointment_id, salon_id, action, changed_by, old_data, new_data)
    values
      (new.id, new.salon_id, 'INSERT', (select auth.uid()), null, to_jsonb(new));
    return new;

  elsif tg_op = 'UPDATE' then
    -- Evita ruido: solo registra si hay cambio real
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into public.appointment_history
        (appointment_id, salon_id, action, changed_by, old_data, new_data)
      values
        (new.id, new.salon_id, 'UPDATE', (select auth.uid()), to_jsonb(old), to_jsonb(new));
    end if;
    return new;

  else -- DELETE
    insert into public.appointment_history
      (appointment_id, salon_id, action, changed_by, old_data, new_data)
    values
      (old.id, old.salon_id, 'DELETE', (select auth.uid()), to_jsonb(old), null);
    return old;
  end if;
end;
$$;

create trigger trg_appointments_history
  after insert or update or delete on public.appointments
  for each row execute function app.log_appointment_change();

-- ------------------------------------------------------------------------------
-- Trigger: auditoría de customers (cambios y borrados — trazabilidad RGPD)
-- ------------------------------------------------------------------------------
create or replace function app.log_customer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into public.customer_history
        (customer_id, salon_id, action, changed_by, old_data, new_data)
      values
        (new.id, new.salon_id, 'UPDATE', (select auth.uid()), to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else -- DELETE
    insert into public.customer_history
      (customer_id, salon_id, action, changed_by, old_data, new_data)
    values
      (old.id, old.salon_id, 'DELETE', (select auth.uid()), to_jsonb(old), null);
    return old;
  end if;
end;
$$;

create trigger trg_customers_history
  after update or delete on public.customers
  for each row execute function app.log_customer_change();

-- ------------------------------------------------------------------------------
-- Trigger: al completar una cita se genera la visita automáticamente
-- ------------------------------------------------------------------------------
create or replace function app.create_visit_on_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _service_name varchar(200);
begin
  -- Solo en la transición → completed (idempotente por el UNIQUE de appointment_id)
  if new.status = 'completed' and old.status is distinct from new.status then
    select s.name into _service_name
    from public.services s
    where s.id = new.service_id;

    insert into public.visits
      (salon_id, appointment_id, customer_id, professional_id,
       service_id, service_name, amount_cents, currency, visited_at)
    values
      (new.salon_id, new.id, new.customer_id, new.professional_id,
       new.service_id, coalesce(_service_name, 'Servicio eliminado'),
       new.price_cents, new.currency, new.starts_at)
    on conflict (appointment_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_appointments_create_visit
  after update of status on public.appointments
  for each row execute function app.create_visit_on_completion();
