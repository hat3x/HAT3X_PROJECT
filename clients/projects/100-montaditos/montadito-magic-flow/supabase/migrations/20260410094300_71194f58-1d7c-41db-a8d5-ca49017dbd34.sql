
-- Create enum for order status
CREATE TYPE public.order_status AS ENUM ('recibido', 'preparando', 'listo', 'entregado', 'cancelado');

-- Create enum for staff roles
CREATE TYPE public.app_role AS ENUM ('admin', 'caja', 'cocina');

-- Locales table
CREATE TABLE public.locales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  direccion TEXT,
  slug TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mesas table
CREATE TABLE public.mesas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id UUID NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  numero_mesa INTEGER NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(local_id, numero_mesa)
);

-- Menu categories
CREATE TABLE public.menu_categorias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  imagen_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Menu products
CREATE TABLE public.menu_productos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria_id UUID NOT NULL REFERENCES public.menu_categorias(id) ON DELETE CASCADE,
  local_id UUID REFERENCES public.locales(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio NUMERIC(10,2) NOT NULL,
  foto_url TEXT,
  disponible BOOLEAN NOT NULL DEFAULT true,
  destacado BOOLEAN NOT NULL DEFAULT false,
  nuevo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pedidos table
CREATE TABLE public.pedidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id UUID NOT NULL REFERENCES public.locales(id),
  mesa_id UUID REFERENCES public.mesas(id),
  numero_pedido INTEGER NOT NULL,
  estado public.order_status NOT NULL DEFAULT 'recibido',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_payment_id TEXT,
  session_id TEXT NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast lookup by local + number
CREATE INDEX idx_pedidos_local_numero ON public.pedidos(local_id, numero_pedido);
CREATE INDEX idx_pedidos_session ON public.pedidos(session_id);

-- Pedido items
CREATE TABLE public.pedido_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.menu_productos(id),
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(10,2) NOT NULL
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  local_id UUID REFERENCES public.locales(id) ON DELETE CASCADE,
  UNIQUE(user_id, role, local_id)
);

-- Enable RLS on all tables
ALTER TABLE public.locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role_for_local(_user_id UUID, _role public.app_role, _local_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role = _role OR role = 'admin') AND (local_id = _local_id OR role = 'admin')
  )
$$;

-- Locales: public read
CREATE POLICY "Anyone can view active locales" ON public.locales FOR SELECT USING (activo = true);
CREATE POLICY "Admins can manage locales" ON public.locales FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Mesas: public read
CREATE POLICY "Anyone can view active mesas" ON public.mesas FOR SELECT USING (activa = true);
CREATE POLICY "Admins can manage mesas" ON public.mesas FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Categories: public read
CREATE POLICY "Anyone can view categories" ON public.menu_categorias FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.menu_categorias FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Products: public read available
CREATE POLICY "Anyone can view available products" ON public.menu_productos FOR SELECT USING (disponible = true);
CREATE POLICY "Admins can manage products" ON public.menu_productos FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Pedidos: session-based for clients, role-based for staff
CREATE POLICY "Clients can create pedidos" ON public.pedidos FOR INSERT WITH CHECK (true);
CREATE POLICY "Clients can view own pedidos" ON public.pedidos FOR SELECT USING (true);
CREATE POLICY "Staff can update pedidos" ON public.pedidos FOR UPDATE USING (
  public.has_role_for_local(auth.uid(), 'caja', local_id)
  OR public.has_role_for_local(auth.uid(), 'cocina', local_id)
);

-- Pedido items
CREATE POLICY "Anyone can create pedido items" ON public.pedido_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view pedido items" ON public.pedido_items FOR SELECT USING (true);

-- User roles: admin only
CREATE POLICY "Admins can manage user roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_locales_updated_at BEFORE UPDATE ON public.locales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_productos_updated_at BEFORE UPDATE ON public.menu_productos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pedidos_updated_at BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime on pedidos
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
