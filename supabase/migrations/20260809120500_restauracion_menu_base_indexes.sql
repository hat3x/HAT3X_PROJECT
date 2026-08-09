-- Kairos — Restauración · Índices de soporte para las FK de products (categoría/estación)
begin;
create index if not exists idx_products_category_id on public.products (category_id);
create index if not exists idx_products_station_id  on public.products (station_id);
commit;
