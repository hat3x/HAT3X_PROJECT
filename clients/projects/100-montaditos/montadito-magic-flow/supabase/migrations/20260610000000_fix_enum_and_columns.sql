-- Fix: ensure all order_status enum values exist
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pendiente';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pendiente_pago';

-- Fix: ensure all pedidos columns exist
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'cocina',
  ADD COLUMN IF NOT EXISTS estado_cocina public.order_status,
  ADD COLUMN IF NOT EXISTS estado_bebidas public.order_status,
  ADD COLUMN IF NOT EXISTS edad_verificada_cliente BOOLEAN NOT NULL DEFAULT false;

-- Fix: ensure pedido_items.destino column exists
ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS destino TEXT NOT NULL DEFAULT 'cocina';

-- Fix: ensure menu_productos optional columns exist
ALTER TABLE public.menu_productos
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS tipo_pan TEXT,
  ADD COLUMN IF NOT EXISTS seccion TEXT;

-- Fix: ensure menu_categorias.logo_url column exists
ALTER TABLE public.menu_categorias
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Ensure franchisees table exists (created in a later migration)
CREATE TABLE IF NOT EXISTS public.franchisees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS public.franchisees ENABLE ROW LEVEL SECURITY;

-- Ensure locales has franchisee_id and GPS columns
ALTER TABLE public.locales
  ADD COLUMN IF NOT EXISTS franchisee_id UUID REFERENCES public.franchisees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lat NUMERIC,
  ADD COLUMN IF NOT EXISTS lng NUMERIC;
