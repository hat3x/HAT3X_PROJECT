
-- 1) Fix anon INSERT policies to require session match
DROP POLICY IF EXISTS "Anon can create pedidos with own session" ON public.pedidos;
CREATE POLICY "Anon can create pedidos with own session"
ON public.pedidos
FOR INSERT
TO anon
WITH CHECK (
  session_id IS NOT NULL
  AND session_id <> ''
  AND session_id = public.current_session_id()
);

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
      AND p.session_id = public.current_session_id()
  )
);

-- 2) Fix get_user_franchisee_id: it must return franchisees.id, not user_roles.local_id.
--    Resolve via locales.franchisee_id.
CREATE OR REPLACE FUNCTION public.get_user_franchisee_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT l.franchisee_id
  FROM public.user_roles ur
  JOIN public.locales l ON l.id = ur.local_id
  WHERE ur.user_id = _user_id AND ur.role = 'franchisee'
  LIMIT 1
$function$;

-- 3) Lock down SECURITY DEFINER functions: revoke broad EXECUTE.
--    Keep cancel_own_pending_order callable by anon/authenticated (RPC used by clients).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_for_local(uuid, public.app_role, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_franchisee_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_pedido_item_destino(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_pedido_item_destino() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_pedido_sections(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_pedido_sections_from_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_cancel_stale_pedidos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_cancel_stale_pending_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_numero_pedido_diario() FROM PUBLIC, anon, authenticated;
