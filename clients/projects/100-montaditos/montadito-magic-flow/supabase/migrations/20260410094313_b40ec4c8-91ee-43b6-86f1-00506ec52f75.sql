
-- Drop overly permissive policies
DROP POLICY "Clients can create pedidos" ON public.pedidos;
DROP POLICY "Anyone can create pedido items" ON public.pedido_items;

-- Require session_id for creating orders
CREATE POLICY "Clients can create pedidos with session" ON public.pedidos 
FOR INSERT WITH CHECK (session_id IS NOT NULL AND session_id != '');

-- Items can only be added to existing pedidos
CREATE POLICY "Items can be added to pedidos" ON public.pedido_items 
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.pedidos WHERE id = pedido_id)
);
