-- =============================================================================
-- salon-os — Migración: trazabilidad de implantes y esterilización (A3)
--
-- El Reglamento (UE) 2017/745 exige identificar cada producto sanitario
-- implantable por su UDI y poder seguirlo hasta el paciente; la normativa
-- española de esterilización, vigente desde 2021, exige trazabilidad completa
-- del material. Sin esto, ninguna clínica que ponga implantes puede usar Salón
-- OS como sistema único — y son las que más facturan.
--
-- Las dos preguntas que esto tiene que saber contestar, y que mandan sobre el
-- diseño:
--
--   1. «Este implante, con este UDI y este lote, ¿a quién se le puso, en qué
--      diente y qué día?»
--   2. «Este ciclo de autoclave, ¿con qué pacientes se usó?»
--
-- La primera es la de la alerta sanitaria: el fabricante retira un lote y hay
-- que llamar a la gente. Por eso `lot` va indexado por salón: buscar por lote
-- es la consulta que ocurre el día malo, no una rareza.
--
-- ── Qué NO se borra ──────────────────────────────────────────────────────────
-- `implant_placement.customer_id` es ON DELETE RESTRICT. Un registro de
-- trazabilidad que desaparece al borrar la ficha no es trazabilidad: la
-- obligación sobrevive al paciente en el sistema.
-- =============================================================================

begin;

-- ── 1. Implantes colocados ──────────────────────────────────────────────────
create table if not exists public.implant_placement (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons (id) on delete cascade,
  customer_id    uuid not null references public.customers (id) on delete restrict,
  -- Diente FDI (11–48). Se valida aquí y no solo en la app: un implante en el
  -- diente "99" es un registro que no sirve para nada el día de la inspección.
  fdi_code       smallint not null check (fdi_code between 11 and 48),

  -- Identificación del producto. `udi_raw` guarda el código TAL CUAL lo leyó el
  -- lector: si un día mejoramos la interpretación, el original sigue ahí.
  udi_raw        text,
  gtin           varchar(14) check (gtin is null or gtin ~ '^[0-9]{14}$'),
  lot            varchar(64),
  serial         varchar(64),
  ref            varchar(64),
  brand          varchar(120),
  expiry         date,

  -- Medidas: lo que pregunta el siguiente profesional que abra esa boca.
  diameter_mm    numeric(4,2) check (diameter_mm is null or diameter_mm > 0),
  length_mm      numeric(4,1) check (length_mm is null or length_mm > 0),

  placed_at      timestamptz not null default now(),
  placed_by      uuid references public.professionals (id) on delete set null,
  appointment_id uuid,
  plan_item_id   uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- FKs compuestas anti cross-tenant: anulan solo su columna, nunca salon_id.
  -- El implante sobrevive a que se borre la cita que lo originó; lo que no
  -- puede es apuntar a la de otro salón.
  constraint implant_placement_customer_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete restrict,
  constraint implant_placement_appointment_fkey
    foreign key (appointment_id, salon_id)
    references public.appointments (id, salon_id) on delete set null (appointment_id)
);

comment on table public.implant_placement is
  'Registro de implantes colocados, con su UDI (GTIN + lote + nº de serie). Responde "este lote, a quién se le puso" — la consulta de una alerta sanitaria. Reglamento (UE) 2017/745.';
comment on column public.implant_placement.udi_raw is
  'El código tal y como lo entregó el lector, sin interpretar. Si mañana leemos mejor el formato, el original sigue disponible.';

-- El índice del día malo: retiran un lote y hay que sacar la lista de pacientes.
create index if not exists idx_implant_placement_lot
  on public.implant_placement (salon_id, lot)
  where lot is not null;
create index if not exists idx_implant_placement_customer
  on public.implant_placement (salon_id, customer_id);
create index if not exists idx_implant_placement_gtin
  on public.implant_placement (salon_id, gtin)
  where gtin is not null;

create trigger trg_implant_placement_updated_at
  before update on public.implant_placement
  for each row execute function app.set_updated_at();

-- ── 2. Ciclos de esterilización ─────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sterilization_result') then
    create type public.sterilization_result as enum ('ok', 'fallido');
  end if;
end
$$;

create table if not exists public.sterilization_cycle (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons (id) on delete cascade,
  autoclave_id varchar(64) not null,
  cycle_number varchar(64) not null,
  program      varchar(120),
  started_at   timestamptz not null,
  result       public.sterilization_result not null,
  operator_id  uuid references public.professionals (id) on delete set null,
  -- Foto o impresión del ticket del autoclave: es la prueba física que pide
  -- una inspección, y sin ella el registro es la palabra de alguien.
  ticket_path  text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Un mismo número de ciclo no puede repetirse en el mismo autoclave: si se
  -- duplica, "el ciclo 42" deja de identificar nada.
  constraint sterilization_cycle_unique_number
    unique (salon_id, autoclave_id, cycle_number),
  constraint sterilization_cycle_id_salon_key unique (id, salon_id)
);

comment on table public.sterilization_cycle is
  'Ciclos de autoclave con su resultado y el ticket como prueba. Un ciclo fallido se registra igual: saber que falló es justo lo que permite retirar el material que pasó por él.';

create index if not exists idx_sterilization_cycle_salon_started
  on public.sterilization_cycle (salon_id, started_at desc);

create trigger trg_sterilization_cycle_updated_at
  before update on public.sterilization_cycle
  for each row execute function app.set_updated_at();

-- ── 3. Uso del material esterilizado ────────────────────────────────────────
-- Esta tabla es la que cierra la trazabilidad: sin ella hay ciclos por un lado
-- y pacientes por otro, y no se puede responder a quién se atendió con el
-- material de un ciclo que salió mal.
create table if not exists public.sterilization_use (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons (id) on delete cascade,
  cycle_id       uuid not null,
  appointment_id uuid not null,
  used_at        timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  constraint sterilization_use_cycle_fkey
    foreign key (cycle_id, salon_id)
    references public.sterilization_cycle (id, salon_id) on delete cascade,
  constraint sterilization_use_appointment_fkey
    foreign key (appointment_id, salon_id)
    references public.appointments (id, salon_id) on delete cascade,
  constraint sterilization_use_unique unique (cycle_id, appointment_id)
);

comment on table public.sterilization_use is
  'Enlace ciclo ↔ cita: cierra la trazabilidad hacia el paciente. Es lo que permite contestar "con el material del ciclo 42 se atendió a estas personas".';

create index if not exists idx_sterilization_use_cycle
  on public.sterilization_use (salon_id, cycle_id);
create index if not exists idx_sterilization_use_appointment
  on public.sterilization_use (salon_id, appointment_id);

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
-- Mismo patrón que `perio_exam`: leer cualquier miembro; escribir owner/manager
-- (cualquier sector) o staff con gate dual de rol + sector odontología.
alter table public.implant_placement   enable row level security;
alter table public.sterilization_cycle enable row level security;
alter table public.sterilization_use   enable row level security;

create policy "members_select_implant_placement"
  on public.implant_placement for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_implant_placement"
  on public.implant_placement for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "dental_staff_insert_implant_placement"
  on public.implant_placement for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
    and app.salon_is_sector(salon_id, 'odontologia'::public.salon_sector)
  );

create policy "managers_update_implant_placement"
  on public.implant_placement for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- Sin política de DELETE a propósito: un registro de trazabilidad no se borra
-- desde la aplicación. Corregir un error es un UPDATE, con su rastro.

create policy "members_select_sterilization_cycle"
  on public.sterilization_cycle for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_sterilization_cycle"
  on public.sterilization_cycle for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "dental_staff_insert_sterilization_cycle"
  on public.sterilization_cycle for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
    and app.salon_is_sector(salon_id, 'odontologia'::public.salon_sector)
  );

create policy "managers_update_sterilization_cycle"
  on public.sterilization_cycle for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "members_select_sterilization_use"
  on public.sterilization_use for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "staff_insert_sterilization_use"
  on public.sterilization_use for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
  );

commit;
