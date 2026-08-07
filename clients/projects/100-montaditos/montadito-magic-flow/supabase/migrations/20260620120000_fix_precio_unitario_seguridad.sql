-- ───────────────────────────────────────────────────────────────────────────
-- FIX DE SEGURIDAD (HIGH): manipulación de precios en el pago.
--
-- Problema: el cliente inserta pedido_items con `precio_unitario` arbitrario y
-- create-payment-intent recalcula el total a partir de ese valor. Un atacante
-- podía insertar un producto real con precio_unitario = 0.01 y pagar 1 céntimo.
--
-- Solución: forzar en la BD el precio real desde menu_productos.precio.
--   - Items SIN variante  -> precio_unitario = precio del producto (autoritativo).
--   - Items CON variante  -> no se permite por debajo del precio base
--                            (se conserva el recargo de la variante, p. ej. Sancho).
-- Se aplica en el servidor, así que ya no depende de lo que envíe el cliente.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_precio_unitario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base numeric;
BEGIN
  SELECT precio INTO v_base FROM public.menu_productos WHERE id = NEW.producto_id;
  IF v_base IS NULL THEN
    RETURN NEW; -- producto inexistente: no debería ocurrir
  END IF;

  IF NEW.variante IS NULL THEN
    NEW.precio_unitario := v_base;                                  -- precio autoritativo
  ELSE
    NEW.precio_unitario := GREATEST(COALESCE(NEW.precio_unitario, v_base), v_base); -- nunca por debajo del base
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_precio_unitario ON public.pedido_items;
CREATE TRIGGER trg_enforce_precio_unitario
BEFORE INSERT OR UPDATE OF precio_unitario, producto_id ON public.pedido_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_precio_unitario();
