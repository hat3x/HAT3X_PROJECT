-- Helper: extrae el session_id del header x-session-id (devuelve '' si no existe)
CREATE OR REPLACE FUNCTION public.current_session_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(
      current_setting('request.headers', true)::json ->> 'x-session-id',
      ''
    ),
    ''
  )
$$;

-- pedidos: anon solo ve los suyos
DROP POLICY IF EXISTS "Anon can view pedidos for tracking" ON public.pedidos;
CREATE POLICY "Anon can view own pedidos by session"
ON public.pedidos FOR SELECT TO anon
USING (
  session_id IS NOT NULL
  AND session_id <> ''
  AND session_id = public.current_session_id()
);

-- pedidos: anon solo crea pedidos cuya session_id coincide con su header
DROP POLICY IF EXISTS "Clients can create pedidos with session" ON public.pedidos;
CREATE POLICY "Anon can create pedidos with own session"
ON public.pedidos FOR INSERT TO anon
WITH CHECK (
  session_id IS NOT NULL
  AND session_id <> ''
  AND session_id = public.current_session_id()
);
-- Mantener INSERT abierto a authenticated también (staff podría crear)
CREATE POLICY "Authenticated can create pedidos"
ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (session_id IS NOT NULL AND session_id <> '');

-- pedido_items: anon solo ve los items de sus pedidos
DROP POLICY IF EXISTS "Anon can view pedido items" ON public.pedido_items;
CREATE POLICY "Anon can view own pedido items by session"
ON public.pedido_items FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_items.pedido_id
      AND p.session_id = public.current_session_id()
      AND p.session_id <> ''
  )
);

-- pedido_items: anon solo añade items a pedidos de su sesión
DROP POLICY IF EXISTS "Anon can add items to existing pedidos" ON public.pedido_items;
CREATE POLICY "Anon can add items to own pedidos"
ON public.pedido_items FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_items.pedido_id
      AND p.session_id = public.current_session_id()
      AND p.session_id <> ''
  )
);