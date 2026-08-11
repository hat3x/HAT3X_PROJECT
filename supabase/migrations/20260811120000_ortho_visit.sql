-- supabase/migrations/20260811120000_ortho_visit.sql
-- Log de progreso de ortodoncia por cita (Fase 1 del módulo de ortodoncia).
-- La ficha y el tratamiento viven en clinical_records.data.ortho (JSONB); esta tabla
-- guarda una entrada por visita.
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/migrations
--   User-Agent: Mozilla/5.0
--   Authorization: Bearer <token>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>

begin;

create table public.ortho_visit (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons(id) on delete cascade,
  customer_id    uuid not null,
  appointment_id uuid references public.appointments(id) on delete set null,
  visit_date     date not null default current_date,
  actions        jsonb not null default '{}',
  notes          text,
  next_step      text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint ortho_visit_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade
);

create index ortho_visit_customer_idx
  on public.ortho_visit (salon_id, customer_id, visit_date desc);

alter table public.ortho_visit enable row level security;

create policy ortho_visit_rw on public.ortho_visit
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
