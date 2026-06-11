-- franchisees: 1 filas

INSERT INTO public.franchisees ("id", "nombre", "email", "stripe_account_id", "stripe_onboarding_completed", "application_fee_percent", "activo", "created_at", "updated_at") VALUES ('5a8ff570-1803-4700-b05f-69a104558968', 'Jose Manuel', 'mostoles@hat3x.com', NULL, FALSE, 0, TRUE, '2026-05-22 11:31:05.267936+00', '2026-05-22 14:50:31.164312+00') ON CONFLICT (id) DO NOTHING;