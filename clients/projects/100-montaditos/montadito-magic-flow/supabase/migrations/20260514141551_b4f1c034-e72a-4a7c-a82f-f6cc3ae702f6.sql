-- 1) REVOKE EXECUTE en funciones SECURITY DEFINER de uso interno
REVOKE EXECUTE ON FUNCTION public.resolve_pedido_item_destino(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_pedido_item_destino()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_pedido_sections(uuid)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_pedido_sections_from_items()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_numero_pedido_diario()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()               FROM PUBLIC, anon, authenticated;

-- 2) pedidos: SELECT por rol/local
DROP POLICY IF EXISTS "Clients can view own pedidos"            ON public.pedidos;
DROP POLICY IF EXISTS "Anon can view pedidos for tracking"      ON public.pedidos;
DROP POLICY IF EXISTS "Staff can view pedidos of their local"   ON public.pedidos;

CREATE POLICY "Anon can view pedidos for tracking"
ON public.pedidos FOR SELECT TO anon
USING (true);

CREATE POLICY "Staff can view pedidos of their local"
ON public.pedidos FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('caja'::public.app_role, 'cocina'::public.app_role)
      AND (ur.local_id IS NULL OR ur.local_id = pedidos.local_id)
  )
);

-- 3) pedido_items: SELECT/INSERT acotados por rol/local del pedido padre
DROP POLICY IF EXISTS "Anyone can view pedido items"                       ON public.pedido_items;
DROP POLICY IF EXISTS "Items can be added to pedidos"                      ON public.pedido_items;
DROP POLICY IF EXISTS "Anon can view pedido items"                         ON public.pedido_items;
DROP POLICY IF EXISTS "Staff can view pedido items of their local"         ON public.pedido_items;
DROP POLICY IF EXISTS "Anon can add items to existing pedidos"             ON public.pedido_items;
DROP POLICY IF EXISTS "Staff can add items to pedidos of their local"      ON public.pedido_items;

CREATE POLICY "Anon can view pedido items"
ON public.pedido_items FOR SELECT TO anon
USING (true);

CREATE POLICY "Staff can view pedido items of their local"
ON public.pedido_items FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.pedidos p
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE p.id = pedido_items.pedido_id
      AND ur.role IN ('caja'::public.app_role, 'cocina'::public.app_role)
      AND (ur.local_id IS NULL OR ur.local_id = p.local_id)
  )
);

CREATE POLICY "Anon can add items to existing pedidos"
ON public.pedido_items FOR INSERT TO anon
WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_items.pedido_id));

CREATE POLICY "Staff can add items to pedidos of their local"
ON public.pedido_items FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.pedidos p
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE p.id = pedido_items.pedido_id
      AND ur.role IN ('caja'::public.app_role, 'cocina'::public.app_role)
      AND (ur.local_id IS NULL OR ur.local_id = p.local_id)
  )
);

-- 4) Realtime: añadir pedido_items si no estaba (pedidos ya lo está)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pedido_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_items';
  END IF;
END $$;

ALTER TABLE public.pedidos       REPLICA IDENTITY FULL;
ALTER TABLE public.pedido_items  REPLICA IDENTITY FULL;