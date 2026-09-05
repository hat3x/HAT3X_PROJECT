-- =============================================================================
-- Kairos — Restauración · Realtime para order_items (KDS)
-- La publicación supabase_realtime debe incluir order_items o el KDS no refresca.
-- Idempotente: no falla si la tabla ya está publicada.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;
