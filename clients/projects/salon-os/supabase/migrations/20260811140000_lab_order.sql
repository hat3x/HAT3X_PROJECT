-- supabase/migrations/20260811140000_lab_order.sql
-- Pedidos a laboratorio de ortodoncia (Fase 4). Estado derivado de las fechas en la app.
--
-- APLICACIÓN VÍA MANAGEMENT API (la aplica el usuario en el SQL editor):
--   POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/migrations
--   Content-Type: application/sql
--   Body: <contenido de este archivo>

begin;

create type public.lab_order_kind as enum ('modelo', 'retenedor', 'alineadores', 'ortopedia', 'otro');

create table public.lab_order (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons(id) on delete cascade,
  customer_id  uuid not null,
  kind         public.lab_order_kind not null,
  lab_name     text,
  sent_at      date not null,
  received_at  date,
  delivered_at date,
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint lab_order_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade
);

create index lab_order_customer_idx on public.lab_order (salon_id, customer_id, sent_at desc);

alter table public.lab_order enable row level security;

create policy lab_order_rw on public.lab_order
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
