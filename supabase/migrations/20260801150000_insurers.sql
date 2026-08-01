-- =============================================================================
-- salon-os — Migración: mutuas / seguros (odontología)
--   insurer                — compañías aseguradoras del salón.
--   customer_insurance     — póliza del paciente con una aseguradora.
--   insurer_service_price  — baremo: precio por servicio y aseguradora.
--   treatment_plan.insurer_id — marca un plan como cubierto por una mutua.
-- Multi-tenant + RLS. FK compuestas anti cross-tenant.
-- =============================================================================

begin;

create table public.insurer (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references public.salons(id) on delete cascade,
  name       text not null,
  phone      text,
  email      text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, salon_id)
);
create index insurer_salon_idx on public.insurer (salon_id, name);

create table public.customer_insurance (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid not null references public.salons(id) on delete cascade,
  customer_id   uuid not null,
  insurer_id    uuid not null,
  policy_number text,
  notes         text,
  created_at    timestamptz not null default now(),
  constraint customer_insurance_customer_fk
    foreign key (customer_id, salon_id) references public.clinical_records (customer_id, salon_id) on delete cascade,
  constraint customer_insurance_insurer_fk
    foreign key (insurer_id, salon_id) references public.insurer (id, salon_id) on delete cascade,
  unique (customer_id, insurer_id)
);
create index customer_insurance_customer_idx on public.customer_insurance (salon_id, customer_id);

create table public.insurer_service_price (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons(id) on delete cascade,
  insurer_id  uuid not null,
  service_id  uuid not null references public.services(id) on delete cascade,
  price_cents integer not null default 0 check (price_cents >= 0),
  created_at  timestamptz not null default now(),
  constraint insurer_service_price_insurer_fk
    foreign key (insurer_id, salon_id) references public.insurer (id, salon_id) on delete cascade,
  unique (insurer_id, service_id)
);
create index insurer_service_price_insurer_idx on public.insurer_service_price (salon_id, insurer_id);

-- Un plan de tratamiento puede estar cubierto por una mutua.
alter table public.treatment_plan
  add column if not exists insurer_id uuid references public.insurer(id) on delete set null;

alter table public.insurer               enable row level security;
alter table public.customer_insurance    enable row level security;
alter table public.insurer_service_price enable row level security;

create policy insurer_rw on public.insurer
  for all using (salon_id in (select app.user_salon_ids())) with check (salon_id in (select app.user_salon_ids()));
create policy customer_insurance_rw on public.customer_insurance
  for all using (salon_id in (select app.user_salon_ids())) with check (salon_id in (select app.user_salon_ids()));
create policy insurer_service_price_rw on public.insurer_service_price
  for all using (salon_id in (select app.user_salon_ids())) with check (salon_id in (select app.user_salon_ids()));

commit;
