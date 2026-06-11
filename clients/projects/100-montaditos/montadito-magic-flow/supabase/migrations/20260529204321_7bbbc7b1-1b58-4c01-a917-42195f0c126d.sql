CREATE OR REPLACE FUNCTION public.cancel_own_pending_order(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session text;
BEGIN
  _session := public.current_session_id();
  IF _session IS NULL OR _session = '' THEN
    RAISE EXCEPTION 'Missing session';
  END IF;

  UPDATE public.pedidos
  SET
    estado = 'cancelado'::public.order_status,
    estado_cocina = CASE WHEN estado_cocina IS NOT NULL THEN 'cancelado'::public.order_status ELSE NULL END,
    estado_bebidas = CASE WHEN estado_bebidas IS NOT NULL THEN 'cancelado'::public.order_status ELSE NULL END,
    updated_at = now(),
    notas = COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE ' | ' END || '[Cancelado por el cliente antes del pago]'
  WHERE id = _pedido_id
    AND session_id = _session
    AND estado = 'pendiente_pago'::public.order_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_own_pending_order(uuid) TO anon, authenticated;