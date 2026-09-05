-- =============================================================================
-- salon-os — Migración: el gabinete como recurso (B2, 1/2)
--
-- Hoy Biodental resuelve el sillón con `settings.single_resource = true`, que
-- bloquea el hueco para TODA la clínica: si alguien está ocupando un gabinete,
-- no se puede citar a nadie más aunque haya otro libre. Funciona con un
-- gabinete y se rompe en cuanto hay dos.
--
-- El gabinete es un recurso COMPARTIDO entre profesionales, y ahí está la
-- diferencia con el horario: dos dentistas pueden trabajar a la vez, pero no en
-- el mismo sillón. Por eso necesita existir como entidad propia en lugar de
-- deducirse de un interruptor del salón.
--
-- ── Qué NO hace esta migración ──────────────────────────────────────────────
-- No retira `single_resource`. El roadmap es explícito: retirarlo solo DESPUÉS
-- de migrar Biodental, no antes. Mientras tanto conviven, y una clínica sin
-- gabinetes configurados se comporta exactamente como hoy —
-- `resolveOperatoryBusy` no bloquea nada cuando no hay ninguno.
-- =============================================================================

begin;

create table if not exists public.operatory (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references public.salons (id) on delete cascade,
  name       varchar(120) not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Dos gabinetes con el mismo nombre en la misma clínica hacen imposible saber
  -- de cuál habla la agenda.
  constraint operatory_nombre_unico unique (salon_id, name),
  -- Clave de apoyo para la FK compuesta de `appointments`.
  constraint operatory_id_salon_key unique (id, salon_id)
);

comment on table public.operatory is
  'Gabinetes (sillones) de la clínica. Recurso compartido entre profesionales: dos pueden trabajar a la vez, pero no en el mismo gabinete. Sustituye al apaño de settings.single_resource, que bloqueaba la clínica entera.';

create index if not exists idx_operatory_salon
  on public.operatory (salon_id)
  where active;

create trigger trg_operatory_updated_at
  before update on public.operatory
  for each row execute function app.set_updated_at();

-- ── La cita puede ocupar un gabinete ────────────────────────────────────────
-- Nullable a propósito: las citas que ya existen no tienen gabinete, y exigirlo
-- ahora obligaría a inventar uno para miles de citas pasadas. Una cita sin
-- gabinete no ocupa ninguno, que es lo correcto durante la convivencia.
alter table public.appointments
  add column if not exists operatory_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_operatory_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_operatory_fkey
      foreign key (operatory_id, salon_id)
      references public.operatory (id, salon_id)
      on delete set null (operatory_id);
  end if;
end
$$;

comment on column public.appointments.operatory_id is
  'Gabinete en el que se atiende. NULL = sin asignar, y entonces no ocupa ninguno: durante la migración hay citas antiguas sin gabinete y contarlas como "ocupan todos" vaciaría la agenda.';

create index if not exists idx_appointments_operatory
  on public.appointments (salon_id, operatory_id)
  where operatory_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Leer, cualquier miembro: la agenda necesita saber los gabinetes. Escribir,
-- solo quien gestiona el salón: dar de alta un sillón es decisión de negocio.
alter table public.operatory enable row level security;

create policy "members_select_operatory"
  on public.operatory for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_operatory"
  on public.operatory for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_operatory"
  on public.operatory for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- Sin política de DELETE: un gabinete se DESACTIVA (`active = false`). Borrarlo
-- dejaría sin explicación las citas que se atendieron en él.

commit;
