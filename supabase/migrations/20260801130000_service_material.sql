-- =============================================================================
-- salon-os — Migración: escandallo (BOM) de materiales por tratamiento
-- public.service_material: qué productos (y cuánta cantidad) consume cada servicio.
--
-- Uso: al marcar una línea de plan como "realizado" (o completar la cita), la
-- server action descuenta automáticamente el stock de estos materiales
-- (registra un stock_movement de tipo 'salida' por cada uno). Multi-tenant + RLS.
-- =============================================================================

begin;

create table public.service_material (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references public.salons(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity   integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (service_id, product_id)
);
create index service_material_service_idx on public.service_material (salon_id, service_id);
create index service_material_product_idx on public.service_material (salon_id, product_id);

alter table public.service_material enable row level security;
create policy service_material_rw on public.service_material
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
