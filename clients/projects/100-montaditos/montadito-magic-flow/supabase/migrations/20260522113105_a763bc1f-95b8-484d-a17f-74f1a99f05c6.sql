
CREATE TABLE public.franchisees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  stripe_account_id text UNIQUE,
  stripe_onboarding_completed boolean NOT NULL DEFAULT false,
  application_fee_percent numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.franchisees ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_franchisees_updated_at
BEFORE UPDATE ON public.franchisees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_user_franchisee_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.local_id::uuid
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id AND ur.role = 'franchisee'
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_franchisee_id(uuid) FROM PUBLIC, anon;

CREATE POLICY "Admins manage franchisees"
ON public.franchisees FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Franchisee views own record"
ON public.franchisees FOR SELECT
USING (id = public.get_user_franchisee_id(auth.uid()));

ALTER TABLE public.locales
ADD COLUMN franchisee_id uuid REFERENCES public.franchisees(id) ON DELETE RESTRICT;

INSERT INTO public.franchisees (nombre, email, application_fee_percent)
VALUES ('Móstoles', 'mostoles@hat3x.com', 0);

UPDATE public.locales
SET franchisee_id = (SELECT id FROM public.franchisees WHERE email = 'mostoles@hat3x.com');

ALTER TABLE public.locales
ALTER COLUMN franchisee_id SET NOT NULL;

CREATE POLICY "Franchisee views own locales pedidos"
ON public.pedidos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.locales l
    WHERE l.id = pedidos.local_id
      AND l.franchisee_id = public.get_user_franchisee_id(auth.uid())
  )
);

CREATE POLICY "Franchisee views own pedido items"
ON public.pedido_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    JOIN public.locales l ON l.id = p.local_id
    WHERE p.id = pedido_items.pedido_id
      AND l.franchisee_id = public.get_user_franchisee_id(auth.uid())
  )
);
