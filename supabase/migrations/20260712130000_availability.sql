-- =============================================================================
-- salon-os — Migración 5/5: horarios de trabajo y disponibilidad
--
-- Base para el cálculo de disponibilidad de la agenda y de la reserva pública:
--   • professional_schedules — horario semanal recurrente por profesional
--   • schedule_exceptions    — excepciones puntuales (día libre / horario especial)
--
-- Convención de día de semana: 0 = domingo … 6 = sábado (igual que
-- JavaScript `Date.getUTCDay()`), para casar sin conversiones con el frontend.
--
-- Las horas se guardan como `time` en la zona horaria del salón (salons.timezone).
-- El instante UTC de cada cita se calcula en la app al convertir fecha + hora
-- local del salón a timestamptz.
-- =============================================================================

-- ------------------------------------------------------------------------------
-- professional_schedules — tramos de trabajo recurrentes por día de la semana
-- (permite varios tramos por día, p. ej. mañana y tarde)
-- ------------------------------------------------------------------------------
create table public.professional_schedules (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null references public.salons (id) on delete cascade,
  professional_id  uuid not null,
  weekday          smallint not null check (weekday between 0 and 6),
  start_time       time not null,
  end_time         time not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_time > start_time),
  -- Coherencia de tenant: el profesional pertenece al mismo salón
  constraint professional_schedules_professional_id_fkey
    foreign key (professional_id, salon_id)
    references public.professionals (id, salon_id) on delete cascade
);

create index idx_professional_schedules_lookup
  on public.professional_schedules (salon_id, professional_id, weekday);

comment on table public.professional_schedules is
  'Horario semanal recurrente por profesional. weekday: 0=domingo … 6=sábado. Horas en la zona del salón.';

-- ------------------------------------------------------------------------------
-- schedule_exceptions — excepciones puntuales a una fecha concreta
--   is_available = false  → el profesional no trabaja ese día (vacaciones, baja)
--   is_available = true   → trabaja con horario especial (start_time / end_time)
-- ------------------------------------------------------------------------------
create table public.schedule_exceptions (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null references public.salons (id) on delete cascade,
  professional_id  uuid not null,
  exception_date   date not null,
  is_available     boolean not null default false,
  start_time       time,
  end_time         time,
  reason           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Si trabaja con horario especial, ambas horas son obligatorias y coherentes
  check (
    (is_available = false and start_time is null and end_time is null)
    or (is_available = true and start_time is not null and end_time is not null
        and end_time > start_time)
  ),
  unique (professional_id, exception_date),
  constraint schedule_exceptions_professional_id_fkey
    foreign key (professional_id, salon_id)
    references public.professionals (id, salon_id) on delete cascade
);

create index idx_schedule_exceptions_lookup
  on public.schedule_exceptions (salon_id, professional_id, exception_date);

comment on table public.schedule_exceptions is
  'Excepciones puntuales al horario recurrente. is_available=false: día no laborable.';

-- ------------------------------------------------------------------------------
-- updated_at automático (reutiliza el helper de la migración 1)
-- ------------------------------------------------------------------------------
create trigger trg_professional_schedules_updated_at
  before update on public.professional_schedules
  for each row execute function app.set_updated_at();

create trigger trg_schedule_exceptions_updated_at
  before update on public.schedule_exceptions
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS — lectura: cualquier miembro del salón; escritura: owner/manager.
-- La reserva pública NO usa estas políticas: accede vía service role en el
-- Route Handler del servidor, validando el salón por slug.
-- ------------------------------------------------------------------------------
alter table public.professional_schedules enable row level security;
alter table public.schedule_exceptions    enable row level security;

create policy "members_select_professional_schedules"
  on public.professional_schedules for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_professional_schedules"
  on public.professional_schedules for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_professional_schedules"
  on public.professional_schedules for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_professional_schedules"
  on public.professional_schedules for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "members_select_schedule_exceptions"
  on public.schedule_exceptions for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_schedule_exceptions"
  on public.schedule_exceptions for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_schedule_exceptions"
  on public.schedule_exceptions for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_schedule_exceptions"
  on public.schedule_exceptions for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
