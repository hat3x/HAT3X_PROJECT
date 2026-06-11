-- Cancelación automática de pedidos expirados
-- Pedidos en pendiente_pago > 15 min se cancelan solos

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cancelar_pedidos_expirados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  filas_afectadas integer;
BEGIN
  UPDATE public.pedidos
  SET estado = 'cancelado'
  WHERE estado = 'pendiente_pago'
    AND created_at < NOW() - INTERVAL '15 minutes';

  GET DIAGNOSTICS filas_afectadas = ROW_COUNT;
  RETURN filas_afectadas;
END;
$$;

-- Solo ejecutable por service_role, no por anon/authenticated
REVOKE ALL ON FUNCTION public.cancelar_pedidos_expirados() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_pedidos_expirados() TO service_role;

-- Programar cada 5 minutos
SELECT cron.schedule(
  'cancelar-pedidos-expirados',
  '*/5 * * * *',
  'SELECT public.cancelar_pedidos_expirados()'
);
