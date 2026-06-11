
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to auto-cancel stale pedidos
CREATE OR REPLACE FUNCTION public.auto_cancel_stale_pedidos()
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
    notas = COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE ' | ' END || '[Auto-cancelado por inactividad > 3h]'
  WHERE estado IN ('pendiente', 'recibido', 'preparando', 'listo')
    AND created_at < now() - interval '3 hours';
END;
$$;

-- Unschedule any existing job with same name to keep it idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('auto-cancel-stale-pedidos');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule every 5 minutes
SELECT cron.schedule(
  'auto-cancel-stale-pedidos',
  '*/5 * * * *',
  $$ SELECT public.auto_cancel_stale_pedidos(); $$
);
