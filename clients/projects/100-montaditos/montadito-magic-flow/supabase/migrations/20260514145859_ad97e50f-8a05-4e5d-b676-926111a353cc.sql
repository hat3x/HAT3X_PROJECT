
DROP POLICY IF EXISTS "Anon can create pedidos with own session" ON public.pedidos;
CREATE POLICY "Anon can create pedidos with own session"
ON public.pedidos
FOR INSERT
TO anon
WITH CHECK (session_id IS NOT NULL AND session_id <> '');

DROP POLICY IF EXISTS "Anon can add items to own pedidos" ON public.pedido_items;
CREATE POLICY "Anon can add items to own pedidos"
ON public.pedido_items
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_items.pedido_id
      AND p.session_id IS NOT NULL
      AND p.session_id <> ''
  )
);
