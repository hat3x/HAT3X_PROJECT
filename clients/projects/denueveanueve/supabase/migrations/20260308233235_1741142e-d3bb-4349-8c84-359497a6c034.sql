CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.customers (user_id, first_name, last_name, phone, email, date_of_birth, status, consent_terms_at, consent_marketing_at, consent_whatsapp_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.email,
    (NEW.raw_user_meta_data->>'date_of_birth')::date,
    'PENDING_VERIFICATION',
    now(),
    CASE WHEN (NEW.raw_user_meta_data->>'consent_marketing')::boolean THEN now() ELSE NULL END,
    CASE WHEN (NEW.raw_user_meta_data->>'consent_whatsapp')::boolean THEN now() ELSE NULL END
  );
  INSERT INTO public.loyalty_accounts (customer_id) SELECT id FROM public.customers WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  INSERT INTO public.welcome_coupons (customer_id, expires_at) SELECT id, now() + INTERVAL '30 days' FROM public.customers WHERE user_id = NEW.id;
  RETURN NEW;
END;
$function$;