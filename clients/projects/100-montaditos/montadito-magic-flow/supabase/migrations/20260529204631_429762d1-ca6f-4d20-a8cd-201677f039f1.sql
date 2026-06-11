DROP POLICY IF EXISTS "Staff can view pedidos of their local" ON public.pedidos;
DROP POLICY IF EXISTS "Franchisee views own locales pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Staff can view pedido items of their local" ON public.pedido_items;
DROP POLICY IF EXISTS "Franchisee views own pedido items" ON public.pedido_items;

CREATE POLICY "Staff can view paid active pedidos of their local"
ON public.pedidos
FOR SELECT
TO authenticated
USING (
  estado NOT IN ('pendiente_pago'::public.order_status, 'cancelado'::public.order_status)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['caja'::public.app_role, 'cocina'::public.app_role])
        AND (ur.local_id IS NULL OR ur.local_id = pedidos.local_id)
    )
  )
);

CREATE POLICY "Franchisee views own paid active pedidos"
ON public.pedidos
FOR SELECT
TO authenticated
USING (
  estado NOT IN ('pendiente_pago'::public.order_status, 'cancelado'::public.order_status)
  AND EXISTS (
    SELECT 1
    FROM public.locales l
    WHERE l.id = pedidos.local_id
      AND l.franchisee_id = public.get_user_franchisee_id(auth.uid())
  )
);

CREATE POLICY "Staff can view paid active pedido items of their local"
ON public.pedido_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.pedidos p
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE p.id = pedido_items.pedido_id
      AND p.estado NOT IN ('pendiente_pago'::public.order_status, 'cancelado'::public.order_status)
      AND ur.role = ANY (ARRAY['caja'::public.app_role, 'cocina'::public.app_role])
      AND (ur.local_id IS NULL OR ur.local_id = p.local_id)
  )
);

CREATE POLICY "Franchisee views own paid active pedido items"
ON public.pedido_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pedidos p
    JOIN public.locales l ON l.id = p.local_id
    WHERE p.id = pedido_items.pedido_id
      AND p.estado NOT IN ('pendiente_pago'::public.order_status, 'cancelado'::public.order_status)
      AND l.franchisee_id = public.get_user_franchisee_id(auth.uid())
  )
);