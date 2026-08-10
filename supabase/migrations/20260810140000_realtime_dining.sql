-- =============================================================================
-- Kairos — Restauración · Realtime para el plano de sala (dining_tables + orders)
-- El plano de mesas debe refrescarse solo al cambiar el estado de mesa/pedido.
-- Idempotente: no falla si alguna tabla ya está publicada.
-- (order_items ya se añadió en Plan C — ver 20260810120000_realtime_order_items.sql)
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='dining_tables') then
    alter publication supabase_realtime add table public.dining_tables;
  end if;
  if not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
