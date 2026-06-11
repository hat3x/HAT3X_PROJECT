
ALTER TABLE public.menu_productos
  ADD COLUMN IF NOT EXISTS seccion TEXT;
CREATE INDEX IF NOT EXISTS idx_menu_productos_seccion ON public.menu_productos(seccion);
