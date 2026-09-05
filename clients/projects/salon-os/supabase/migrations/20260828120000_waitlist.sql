-- =============================================================================
-- salon-os — Lista de espera (B3)
--
-- El problema, tal cual pasa: cancelan la cita de las nueve y nadie sabe a quién
-- llamar. El hueco se pierde, el sillón se queda parado una hora y el paciente
-- que llevaba tres semanas esperando ni se entera de que había sitio.
--
-- Es la carencia con mejor retorno por euro del roadmap dental, porque casi todo
-- lo que necesita ya está construido: los pacientes, sus teléfonos, el recall y
-- el canal de WhatsApp. Solo faltaba dónde apuntar quién espera qué.
--
-- ── QUÉ SIGNIFICAN LOS NULL ────────────────────────────────────────────────
-- En esta tabla `null` quiere decir "me da igual", NO "sin datos":
--   · service_id null      → le vale cualquier tratamiento
--   · professional_id null → le da igual quién le atienda
--   · weekdays vacío       → cualquier día
--   · from_time/to_time    → sin límite por ese lado
-- Filtrar por un campo que la persona dejó en blanco sería inventarse una
-- restricción que nadie pidió, y dejar fuera justo a quien más flexible es. La
-- lógica de emparejamiento vive en `src/lib/booking/waitlist.ts`, con tests.
--
-- Las horas van en hora LOCAL del salón: el paciente dijo "los lunes por la
-- mañana", no "a las 08:00 UTC".
--
-- Tabla nueva y vacía: aditiva, sin backfill.
-- =============================================================================

begin;

create type public.waitlist_status as enum (
  'esperando',  -- en la lista, pendiente de que salga algo
  'avisado',    -- se le ofreció un hueco y no ha contestado todavía
  'agendado',   -- aceptó y tiene cita: la entrada se cierra
  'descartado'  -- ya no interesa (lo pidió, o caducó)
);

comment on type public.waitlist_status is
  'Estado de una entrada de la lista de espera. esperando → avisado → agendado | descartado.';

create table public.waitlist_entry (
  id              uuid primary key default gen_random_uuid(),
  salon_id        uuid not null references public.salons (id) on delete cascade,
  customer_id     uuid not null,

  -- Qué aceptaría. NULL = "me da igual" (ver cabecera).
  service_id      uuid references public.services (id) on delete set null,
  professional_id uuid,

  -- Cuándo le viene bien. 0=domingo … 6=sábado, misma convención que
  -- `professional_schedules.weekday` y `weekdayOfLocalDate`.
  weekdays        smallint[] not null default '{}',
  from_time       time,
  to_time         time,

  -- Mayor = se le llama antes. La clínica lo sube en urgencias o cuando hay un
  -- tratamiento a medias que conviene no interrumpir.
  priority        smallint not null default 0,

  notes           text,
  status          public.waitlist_status not null default 'esperando',

  -- Hasta cuándo tiene sentido llamar. Quien se apuntó para "antes de las
  -- vacaciones" no espera una llamada en octubre.
  expires_at      timestamptz,
  -- Última vez que se le ofreció un hueco, para no acribillar a la misma persona.
  notified_at     timestamptz,

  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint waitlist_entry_customer_fk
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete cascade,

  -- Una franja invertida no dejaría pasar a nadie, y nadie entendería por qué.
  constraint waitlist_entry_time_range check (
    from_time is null or to_time is null or to_time > from_time
  ),
  -- Días fuera de 0..6 serían silenciosamente inalcanzables.
  constraint waitlist_entry_weekdays_range check (
    weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

comment on table public.waitlist_entry is
  'Pacientes esperando un hueco. NULL en service_id/professional_id y weekdays vacío significan "me da igual", no "sin datos".';

-- La consulta caliente: al cancelar una cita se buscan los candidatos vivos de
-- ese salón. El índice parcial deja fuera a los ya agendados y descartados, que
-- con el tiempo son la mayoría.
create index waitlist_entry_vivos_idx
  on public.waitlist_entry (salon_id, priority desc, created_at)
  where status in ('esperando', 'avisado');

create index waitlist_entry_customer_idx
  on public.waitlist_entry (salon_id, customer_id);

create trigger trg_waitlist_entry_updated_at
  before update on public.waitlist_entry
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS — la lista de espera es operativa diaria de mostrador: cualquier miembro
-- del salón la lee y la gestiona. Mismo criterio que `appointments`.
-- ------------------------------------------------------------------------------
alter table public.waitlist_entry enable row level security;

create policy "members_rw_waitlist_entry"
  on public.waitlist_entry for all to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
