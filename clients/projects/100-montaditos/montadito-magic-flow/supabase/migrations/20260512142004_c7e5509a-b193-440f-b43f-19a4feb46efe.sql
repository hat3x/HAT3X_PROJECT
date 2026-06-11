CREATE OR REPLACE FUNCTION public.resolve_pedido_item_destino(_producto_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN mc.nombre = 'Bebidas' THEN 'bebidas'
    ELSE 'cocina'
  END
  FROM public.menu_productos mp
  LEFT JOIN public.menu_categorias mc ON mc.id = mp.categoria_id
  WHERE mp.id = _producto_id
$$;

CREATE OR REPLACE FUNCTION public.set_pedido_item_destino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.destino := COALESCE(public.resolve_pedido_item_destino(NEW.producto_id), 'cocina');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_pedido_item_destino_before_write ON public.pedido_items;
CREATE TRIGGER set_pedido_item_destino_before_write
BEFORE INSERT OR UPDATE OF producto_id ON public.pedido_items
FOR EACH ROW
EXECUTE FUNCTION public.set_pedido_item_destino();

CREATE OR REPLACE FUNCTION public.sync_pedido_sections(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_cocina boolean;
  has_bebidas boolean;
BEGIN
  SELECT
    COALESCE(bool_or(destino = 'cocina'), false),
    COALESCE(bool_or(destino = 'bebidas'), false)
  INTO has_cocina, has_bebidas
  FROM public.pedido_items
  WHERE pedido_id = _pedido_id;

  UPDATE public.pedidos
  SET
    tipo = CASE
      WHEN has_cocina AND has_bebidas THEN 'mixto'
      WHEN has_bebidas THEN 'bebidas'
      ELSE 'cocina'
    END,
    estado_cocina = CASE
      WHEN has_cocina THEN COALESCE(estado_cocina, 'recibido'::public.order_status)
      ELSE NULL
    END,
    estado_bebidas = CASE
      WHEN has_bebidas THEN COALESCE(estado_bebidas, 'recibido'::public.order_status)
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = _pedido_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_pedido_sections_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_pedido_sections(OLD.pedido_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_pedido_sections(NEW.pedido_id);

  IF TG_OP = 'UPDATE' AND OLD.pedido_id IS DISTINCT FROM NEW.pedido_id THEN
    PERFORM public.sync_pedido_sections(OLD.pedido_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_pedido_sections_after_items_write ON public.pedido_items;
CREATE TRIGGER sync_pedido_sections_after_items_write
AFTER INSERT OR UPDATE OF pedido_id, producto_id, destino OR DELETE ON public.pedido_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_pedido_sections_from_items();