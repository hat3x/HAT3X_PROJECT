-- Constraints de seguridad: impedir importes negativos o cero en pedidos
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_total_non_negative CHECK (total >= 0);

ALTER TABLE public.pedido_items
  ADD CONSTRAINT items_cantidad_positive CHECK (cantidad > 0),
  ADD CONSTRAINT items_precio_unitario_positive CHECK (precio_unitario > 0);
