-- Kairos — Restauración · Backstop de idempotencia: una sola venta por pedido.
begin;
create unique index if not exists pos_sales_order_id_unique
  on public.pos_sales (order_id) where order_id is not null;
commit;
