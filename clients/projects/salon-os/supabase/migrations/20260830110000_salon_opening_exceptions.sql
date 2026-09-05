-- =============================================================================
-- salon-os — Migración: excepciones del horario de la CLÍNICA
--
-- El caso real que la motiva: Nicolás pasa consulta el martes 1 de septiembre
-- por la tarde, pero SOLO ese martes. Meter "martes por la tarde" en el horario
-- semanal abriría la clínica todos los martes del año, que no es lo que ocurre.
--
-- Hasta ahora las excepciones solo existían para el PROFESIONAL
-- (`schedule_exceptions`) y el horario de la clínica era exclusivamente
-- semanal. Por eso el turno de tarde de Nicolás desaparecía de la agenda: el
-- motor cruza profesional ∩ clínica, y la clínica seguía cerrando a las 14:00.
-- La configuración se aceptaba y no servía para nada, sin avisar a nadie.
--
-- ── Semántica ────────────────────────────────────────────────────────────────
--   · `is_open = false` (sin horas) → la clínica CIERRA ese día. Manda sobre
--     todo: sobre el horario semanal y sobre cualquier turno extra apuntado
--     antes para esa misma fecha. Cerrado es cerrado.
--   · `is_open = true` (con horas)  → turno EXTRA que SE SUMA al horario
--     semanal. Añadir una tarde no debe obligar a reescribir la mañana.
--
-- Se permiten varias filas por fecha: dos turnos extra el mismo día son dos
-- filas. La lógica vive en `resolveSalonRanges`, probada; aquí solo el almacén
-- y la coherencia que la base sí puede garantizar.
-- =============================================================================

begin;

create table if not exists public.salon_opening_exceptions (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons (id) on delete cascade,
  exception_date date not null,
  is_open        boolean not null,
  start_time     time,
  end_time       time,
  reason         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Un cierre no lleva horas; una apertura las lleva las dos y en orden. Sin
  -- esto cabría un "abierto de null a null", que no significa nada y que el
  -- motor tendría que adivinar.
  constraint salon_opening_exceptions_horas_coherentes check (
    (is_open = false and start_time is null and end_time is null)
    or (is_open = true and start_time is not null and end_time is not null
        and end_time > start_time)
  )
);

comment on table public.salon_opening_exceptions is
  'Excepciones del horario de la clínica para una fecha concreta: cerrar un día (is_open=false) o abrir un turno extra (is_open=true con horas). El turno extra SE SUMA al horario semanal; el cierre manda sobre todo lo demás.';

create index if not exists idx_salon_opening_exceptions_fecha
  on public.salon_opening_exceptions (salon_id, exception_date);

create trigger trg_salon_opening_exceptions_updated_at
  before update on public.salon_opening_exceptions
  for each row execute function app.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Leer, cualquier miembro: el horario lo consulta todo el mundo. Escribir, solo
-- quien gestiona el salón — abrir o cerrar un día es una decisión de negocio.
alter table public.salon_opening_exceptions enable row level security;

create policy "members_select_salon_opening_exceptions"
  on public.salon_opening_exceptions for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_salon_opening_exceptions"
  on public.salon_opening_exceptions for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_salon_opening_exceptions"
  on public.salon_opening_exceptions for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_salon_opening_exceptions"
  on public.salon_opening_exceptions for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

commit;
