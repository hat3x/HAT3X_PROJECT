
ALTER TABLE public.menu_productos
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS tipo_pan TEXT;

ALTER TABLE public.menu_categorias
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE INDEX IF NOT EXISTS idx_menu_productos_numero ON public.menu_productos(numero);
