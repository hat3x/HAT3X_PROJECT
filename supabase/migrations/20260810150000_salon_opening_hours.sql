-- =============================================================================
-- salon-os — Horario de apertura de la CLÍNICA/salón
--
-- Horario semanal recurrente a nivel de SALÓN (no de profesional). El motor de
-- disponibilidad lo INTERSECTA con el horario de cada profesional: solo hay hueco
-- si la clínica está abierta Y el profesional trabaja. Es la fuente de verdad de
-- "cuándo abre el negocio" que edita el propietario (p. ej. Nadia en Biodental) y
-- a la que se ciñe la recepcionista de voz.
--
-- Retrocompatibilidad: los salones que NO tengan filas aquí siguen calculando la
-- disponibilidad solo con el horario por profesional (el motor ignora la
-- intersección cuando no hay horario de clínica). Ver src/lib/booking/server.ts
-- (loadProfessionalDayInputs) y src/lib/booking/availability.ts (resolveWorkingRanges).
--
-- Convención de día de semana: 0 = domingo … 6 = sábado (igual que
-- JavaScript `Date.getUTCDay()`). Horas en `time`, zona del salón (salons.timezone).
-- Permite varios tramos por día (p. ej. mañana y tarde) → sin UNIQUE por weekday.
-- =============================================================================

create table public.salon_opening_hours (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time > start_time)
);

create index idx_salon_opening_hours_lookup
  on public.salon_opening_hours (salon_id, weekday);

comment on table public.salon_opening_hours is
  'Horario de apertura recurrente a nivel de salón. weekday: 0=domingo … 6=sábado. Horas en la zona del salón. Se intersecta con el horario por profesional en el cálculo de disponibilidad.';

-- updated_at automático (reutiliza el helper app.set_updated_at()).
create trigger trg_salon_opening_hours_updated_at
  before update on public.salon_opening_hours
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS — lectura: cualquier miembro del salón; escritura: owner/manager.
-- La reserva pública y la recepción NO usan estas políticas: acceden vía service
-- role en el servidor, acotando por salon_id a mano.
-- ------------------------------------------------------------------------------
alter table public.salon_opening_hours enable row level security;

create policy "members_select_salon_opening_hours"
  on public.salon_opening_hours for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_salon_opening_hours"
  on public.salon_opening_hours for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_salon_opening_hours"
  on public.salon_opening_hours for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_salon_opening_hours"
  on public.salon_opening_hours for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
