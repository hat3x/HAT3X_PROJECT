-- Añadir estados independientes para cocina y bebidas en un mismo pedido
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS estado_cocina public.order_status,
  ADD COLUMN IF NOT EXISTS estado_bebidas public.order_status;

-- Marcar el destino de cada item del pedido
ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS destino text NOT NULL DEFAULT 'cocina'
    CHECK (destino IN ('cocina','bebidas'));