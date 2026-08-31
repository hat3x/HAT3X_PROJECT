CREATE OR REPLACE FUNCTION public.check_customer_exists(_email text, _phone text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'email_exists', EXISTS (SELECT 1 FROM public.customers WHERE email = _email),
    'phone_exists', EXISTS (SELECT 1 FROM public.customers WHERE phone = _phone)
  )
$$;