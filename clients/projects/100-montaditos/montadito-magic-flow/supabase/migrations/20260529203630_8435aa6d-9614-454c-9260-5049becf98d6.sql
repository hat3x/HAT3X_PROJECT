-- Tighten staff/franchisee SELECT policies on pedidos and pedido_items
-- so that orders in 'pendiente_pago' never leak into Caja/Cocina apps.

-- pedidos: staff SELECT
DROP POLICY IF EXISTS "Staff can view pedidos of their local" ON public.pedidos;
CREATE POLICY "Staff can view pedidos of their local"
ON public.pedidos
FOR SELECT
TO authenticated
USING (
  estado <> 'pendiente_pago'::public.order_status
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['caja'::public.app_role, 'cocina'::public.app_role])
        AND (ur.local_id IS NULL OR ur.local_id = pedidos.local_id)
    )
  )
);

-- pedidos: franchisee SELECT
DROP POLICY IF EXISTS "Franchisee views own locales pedidos" ON public.pedidos;
CREATE POLICY "Franchisee views own locales pedidos"
ON public.pedidos
FOR SELECT
USING (
  estado <> 'pendiente_pago'::public.order_status
  AND EXISTS (
    SELECT 1 FROM public.locales l
    WHERE l.id = pedidos.local_id
      AND l.franchisee_id = public.get_user_franchisee_id(auth.uid())
  )
);

-- pedido_items: staff SELECT
DROP POLICY IF EXISTS "Staff can view pedido items of their local" ON public.pedido_items;
CREATE POLICY "Staff can view pedido items of their local"
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
      AND p.estado <> 'pendiente_pago'::public.order_status
      AND ur.role = ANY (ARRAY['caja'::public.app_role, 'cocina'::public.app_role])
      AND (ur.local_id IS NULL OR ur.local_id = p.local_id)
  )
);

-- pedido_items: franchisee SELECT
DROP POLICY IF EXISTS "Franchisee views own pedido items" ON public.pedido_items;
CREATE POLICY "Franchisee views own pedido items"
ON public.pedido_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.pedidos p
    JOIN public.locales l ON l.id = p.local_id
    WHERE p.id = pedido_items.pedido_id
      AND p.estado <> 'pendiente_pago'::public.order_status
      AND l.franchisee_id = public.get_user_franchisee_id(auth.uid())
  )
);