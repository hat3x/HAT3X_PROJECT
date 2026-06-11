CREATE OR REPLACE FUNCTION public.assign_numero_pedido_diario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(numero_pedido), 0) + 1
  INTO next_num
  FROM public.pedidos
  WHERE local_id = NEW.local_id
    AND (created_at AT TIME ZONE 'Europe/Madrid')::date = (now() AT TIME ZONE 'Europe/Madrid')::date;

  NEW.numero_pedido := next_num;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_numero_pedido_diario ON public.pedidos;
CREATE TRIGGER set_numero_pedido_diario
BEFORE INSERT ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.assign_numero_pedido_diario();