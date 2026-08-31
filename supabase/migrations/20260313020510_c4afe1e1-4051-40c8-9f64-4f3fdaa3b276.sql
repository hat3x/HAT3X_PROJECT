
-- Enable realtime for tables needed by the client
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.welcome_coupons;
