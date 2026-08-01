-- =============================================================================
-- salon-os — Migración: planes de tratamiento / presupuestos (odontología)
-- (public.treatment_plan, public.plan_phase, public.plan_item)
--
-- Jerarquía: treatment_plan → plan_phase → plan_item.
--   treatment_plan  cabecera (estado del plan, moneda, notas)
--   plan_phase      fases del plan (p.ej. "Fase 1 — Higiene")
--   plan_item       líneas presupuestadas (servicio, diente, precio, estado)
--
-- Dinero en CÉNTIMOS (int), coherente con services.price_cents / pos_invoices.*_cents.
-- line_total_cents es GENERATED = quantity * unit_price_cents - discount_cents (base pre-impuesto).
--
-- Máquina de estados del item (se valida en las server actions, no en BD para
-- permitir correcciones): propuesto → aceptado → en_curso → realizado, con
-- rechazado / anulado como salidas. El estado del plan es un roll-up (derivado).
--
-- Enlace odontograma (mecánico, en las actions): un item con fdi_code materializa
-- un odontogram_finding tooth_state='pendiente' (rojo) al proponerse y 'hecho'
-- (azul) al realizarse; plan_item.finding_id guarda la referencia.
--
-- Multi-tenant: salon_id NOT NULL + FK compuestas (x_id, salon_id) anti cross-tenant.
-- RLS: SELECT/INSERT/UPDATE/DELETE acotados a app.user_salon_ids(); el gate de
-- sector (odontologia) + rol se refuerza en las server actions (defensa en profundidad).
-- =============================================================================

begin;

create type public.treatment_plan_status as enum
  ('draft','proposed','accepted','in_progress','completed','cancelled');

create type public.plan_item_state as enum
  ('propuesto','aceptado','en_curso','realizado','rechazado','anulado');

-- ---------------------------------------------------------------------------
-- treatment_plan
-- ---------------------------------------------------------------------------
create table public.treatment_plan (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null,
  status      public.treatment_plan_status not null default 'draft',
  currency    char(3) not null default 'EUR',
  notes       text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint treatment_plan_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade,
  unique (id, salon_id)
);
create index treatment_plan_customer_idx on public.treatment_plan (salon_id, customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- plan_phase
-- ---------------------------------------------------------------------------
create table public.plan_phase (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references public.salons(id) on delete cascade,
  plan_id    uuid not null,
  position   int not null default 0,
  name       text not null,
  priority   int not null default 0,
  created_at timestamptz not null default now(),
  constraint plan_phase_plan_fk
    foreign key (plan_id, salon_id)
    references public.treatment_plan (id, salon_id) on delete cascade,
  unique (id, salon_id)
);
create index plan_phase_plan_idx on public.plan_phase (salon_id, plan_id, position);

-- ---------------------------------------------------------------------------
-- plan_item
-- ---------------------------------------------------------------------------
create table public.plan_item (
  id                       uuid primary key default gen_random_uuid(),
  salon_id                 uuid not null references public.salons(id) on delete cascade,
  plan_id                  uuid not null,
  phase_id                 uuid,
  position                 int not null default 0,
  service_id               uuid references public.services(id) on delete set null,
  description              text,
  fdi_code                 smallint,
  surfaces                 text[] not null default '{}',
  quantity                 int not null default 1 check (quantity > 0),
  unit_price_cents         int not null default 0 check (unit_price_cents >= 0),
  discount_cents           int not null default 0 check (discount_cents >= 0),
  tax_rate                 numeric(5,2) not null default 0,
  line_total_cents         int generated always as
                             (quantity * unit_price_cents - discount_cents) stored,
  state                    public.plan_item_state not null default 'propuesto',
  scheduled_appointment_id uuid references public.appointments(id) on delete set null,
  executed_at              timestamptz,
  executed_by              uuid,
  finding_id               uuid references public.odontogram_findings(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint plan_item_plan_fk
    foreign key (plan_id, salon_id)
    references public.treatment_plan (id, salon_id) on delete cascade,
  constraint plan_item_phase_fk
    foreign key (phase_id, salon_id)
    references public.plan_phase (id, salon_id) on delete set null
);
create index plan_item_plan_idx  on public.plan_item (salon_id, plan_id, position);
create index plan_item_phase_idx on public.plan_item (salon_id, phase_id);

-- ---------------------------------------------------------------------------
-- RLS — acotado al salón (multi-tenant). Gate de sector+rol en server actions.
-- ---------------------------------------------------------------------------
alter table public.treatment_plan enable row level security;
alter table public.plan_phase     enable row level security;
alter table public.plan_item      enable row level security;

create policy treatment_plan_rw on public.treatment_plan
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));
create policy plan_phase_rw on public.plan_phase
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));
create policy plan_item_rw on public.plan_item
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
