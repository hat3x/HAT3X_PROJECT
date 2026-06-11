REVOKE ALL ON FUNCTION public.resolve_pedido_item_destino(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_pedido_item_destino() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_pedido_sections(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_pedido_sections_from_items() FROM PUBLIC, anon, authenticated;