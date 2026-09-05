-- =============================================================================
-- salon-os — Migración: inventario / control de stock de material
-- Amplía public.products (min_stock, unit) + public.stock_movement (libro de movimientos).
--
-- Modelo: `products.stock` (ya existente) es la EXISTENCIA ACTUAL por producto.
-- Cada movimiento (entrada/salida/ajuste/merma) se registra en `stock_movement`
-- y la server action actualiza `products.stock` en la misma transacción lógica.
-- Lote y caducidad viajan en las ENTRADAS (trazabilidad de implantes/biomateriales).
-- Alerta de reposición: products.stock <= min_stock. Multi-tenant por salon_id + RLS.
-- =============================================================================

begin;

alter table public.products add column if not exists min_stock integer not null default 0;
alter table public.products add column if not exists unit text not null default 'unidad';

create type public.stock_movement_kind as enum ('entrada','salida','ajuste','merma');

create table public.stock_movement (
  id              uuid primary key default gen_random_uuid(),
  salon_id        uuid not null references public.salons(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  kind            public.stock_movement_kind not null,
  quantity        integer not null check (quantity <> 0),  -- magnitud con signo aplicada al stock
  resulting_stock integer,                                  -- foto del stock tras el movimiento
  lot             text,                                     -- lote (entradas)
  expiry          date,                                     -- caducidad (entradas)
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index stock_movement_product_idx on public.stock_movement (salon_id, product_id, created_at desc);
create index stock_movement_expiry_idx  on public.stock_movement (salon_id, expiry) where expiry is not null;

alter table public.stock_movement enable row level security;
create policy stock_movement_rw on public.stock_movement
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
