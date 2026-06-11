
CREATE OR REPLACE FUNCTION public.auto_cancel_stale_pending_payment()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.pedidos
  SET
    estado = 'cancelado'::public.order_status,
    estado_cocina = CASE WHEN estado_cocina IS NOT NULL THEN 'cancelado'::public.order_status ELSE NULL END,
    estado_bebidas = CASE WHEN estado_bebidas IS NOT NULL THEN 'cancelado'::public.order_status ELSE NULL END,
    updated_at = now(),
    notas = COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE ' | ' END || '[Auto-cancelado: pago no confirmado en 30 min]'
  WHERE estado = 'pendiente_pago'
    AND created_at < now() - interval '30 minutes';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
