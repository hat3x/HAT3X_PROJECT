-- Custom types
CREATE TYPE public.customer_status AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'DISABLED');
CREATE TYPE public.appointment_status AS ENUM ('CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE public.coupon_status AS ENUM ('ACTIVE', 'USED', 'EXPIRED');
CREATE TYPE public.points_movement_type AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'EXPIRE');
CREATE TYPE public.reward_type AS ENUM ('SCALP_DIAGNOSIS', 'EXPRESS_TREATMENT', 'RETAIL_VOUCHER', 'PACK_UPGRADE', 'CUSTOM');
CREATE TYPE public.reward_status AS ENUM ('AVAILABLE', 'REDEEMED', 'EXPIRED');
CREATE TYPE public.subscription_plan AS ENUM ('LADIES_59', 'MEN_19');
CREATE TYPE public.subscription_status AS ENUM ('ACTIVE', 'PAYMENT_DUE', 'CANCELLED_END_OF_PERIOD', 'EXPIRED');
CREATE TYPE public.campaign_channel AS ENUM ('WHATSAPP');
CREATE TYPE public.campaign_status AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');
CREATE TYPE public.delivery_status AS ENUM ('TARGETED', 'SENT', 'DELIVERED', 'FAILED');
CREATE TYPE public.audit_actor_role AS ENUM ('CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN', 'SYSTEM');
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff', 'customer');

-- RBAC table + function FIRST
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Locations
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, address TEXT NOT NULL, hours_json JSONB NOT NULL DEFAULT '{}',
  whatsapp_contact TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Locations readable by all authenticated" ON public.locations FOR SELECT TO authenticated USING (true);

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
  status public.customer_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
  phone_verified_at TIMESTAMPTZ, email_verified_at TIMESTAMPTZ,
  preferred_location_id UUID REFERENCES public.locations(id),
  consent_terms_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_marketing_at TIMESTAMPTZ, consent_whatsapp_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own profile" ON public.customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Customers can update own profile" ON public.customers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Customers can insert own profile" ON public.customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff can view all customers" ON public.customers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Services
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES public.locations(id),
  name TEXT NOT NULL, category TEXT, duration_min INT NOT NULL,
  excluded_from_discount BOOLEAN NOT NULL DEFAULT false, active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Services readable by all authenticated" ON public.services FOR SELECT TO authenticated USING (true);

-- Appointments
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'CONFIRMED',
  reschedule_count INT NOT NULL DEFAULT 0, customer_notes TEXT, staff_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own appointments" ON public.appointments FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));
CREATE POLICY "Customers can insert own appointments" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));
CREATE POLICY "Customers can update own appointments" ON public.appointments FOR UPDATE TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));
CREATE POLICY "Staff can manage all appointments" ON public.appointments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Appointment Services
CREATE TABLE public.appointment_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id)
);
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Appointment services follow appointment access" ON public.appointment_services FOR SELECT TO authenticated
  USING (appointment_id IN (SELECT id FROM public.appointments));

-- Slot Holds
CREATE TABLE public.slot_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.slot_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can manage own holds" ON public.slot_holds FOR ALL TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Welcome Coupon
CREATE TABLE public.welcome_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES public.customers(id),
  percent_off INT NOT NULL DEFAULT 5, expires_at TIMESTAMPTZ NOT NULL,
  status public.coupon_status NOT NULL DEFAULT 'ACTIVE', used_at TIMESTAMPTZ, audit_redemption_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.welcome_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own coupon" ON public.welcome_coupons FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Loyalty Account
CREATE TABLE public.loyalty_accounts (
  customer_id UUID PRIMARY KEY REFERENCES public.customers(id),
  visits_total INT NOT NULL DEFAULT 0, points_balance INT NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ, last_activity_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own loyalty" ON public.loyalty_accounts FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Points Movements
CREATE TABLE public.points_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  type public.points_movement_type NOT NULL, points INT NOT NULL, reason TEXT NOT NULL,
  ref_type TEXT, ref_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.points_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own movements" ON public.points_movements FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Rewards
CREATE TABLE public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  type public.reward_type NOT NULL, status public.reward_status NOT NULL DEFAULT 'AVAILABLE',
  code TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ, redeemed_at_location_id UUID REFERENCES public.locations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own rewards" ON public.rewards FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  plan public.subscription_plan NOT NULL, price_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR', status public.subscription_status NOT NULL DEFAULT 'ACTIVE',
  stripe_customer_id TEXT, stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ, next_renewal_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can view own subscription" ON public.subscriptions FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Club Benefit Usage
CREATE TABLE public.club_benefit_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
  benefit_key TEXT NOT NULL, used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  staff_actor_id UUID NOT NULL REFERENCES auth.users(id), metadata JSONB
);
ALTER TABLE public.club_benefit_usages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage benefit usages" ON public.club_benefit_usages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, channel public.campaign_channel NOT NULL DEFAULT 'WHATSAPP',
  status public.campaign_status NOT NULL DEFAULT 'DRAFT', segment_json JSONB NOT NULL DEFAULT '{}',
  template_name TEXT, offer_text TEXT, cta_url TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ, sent_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager/Admin can manage campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Campaign Deliveries
CREATE TABLE public.campaign_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  status public.delivery_status NOT NULL DEFAULT 'TARGETED',
  provider_message_id TEXT, last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager/Admin can manage deliveries" ON public.campaign_deliveries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Audit Log
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_role public.audit_actor_role NOT NULL, actor_id UUID,
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id UUID NOT NULL,
  location_id UUID REFERENCES public.locations(id), metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager/Admin can view audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Device Push Subscriptions
CREATE TABLE public.device_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  user_agent TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.device_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers can manage own push subs" ON public.device_push_subscriptions FOR ALL TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Indexes
CREATE INDEX idx_appointments_customer ON public.appointments(customer_id);
CREATE INDEX idx_appointments_location_start ON public.appointments(location_id, start_at);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_slot_holds_expires ON public.slot_holds(expires_at);
CREATE INDEX idx_points_movements_customer ON public.points_movements(customer_id);
CREATE INDEX idx_rewards_customer ON public.rewards(customer_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity, entity_id);
CREATE INDEX idx_customers_user_id ON public.customers(user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create customer profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.customers (user_id, first_name, last_name, phone, email, status, consent_terms_at, consent_marketing_at, consent_whatsapp_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.email,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed data
INSERT INTO public.locations (name, address, hours_json, whatsapp_contact) VALUES
  ('denueveanueve Centro', 'Calle Gran Vía 15, Madrid', '{"mon":"09:00-21:00","tue":"09:00-21:00","wed":"09:00-21:00","thu":"09:00-21:00","fri":"09:00-21:00","sat":"09:00-14:00","sun":"closed"}', '+34600000001'),
  ('denueveanueve Norte', 'Calle Serrano 42, Madrid', '{"mon":"09:00-21:00","tue":"09:00-21:00","wed":"09:00-21:00","thu":"09:00-21:00","fri":"09:00-21:00","sat":"09:00-14:00","sun":"closed"}', '+34600000002'),
  ('denueveanueve Sur', 'Calle Alcalá 78, Madrid', '{"mon":"09:00-21:00","tue":"09:00-21:00","wed":"09:00-21:00","thu":"09:00-21:00","fri":"09:00-21:00","sat":"09:00-14:00","sun":"closed"}', '+34600000003');

INSERT INTO public.services (name, category, duration_min, excluded_from_discount) VALUES
  ('Corte Señora', 'Corte', 45, false),
  ('Corte Caballero', 'Corte', 30, false),
  ('Color Raíz', 'Color', 60, false),
  ('Mechas', 'Color', 90, false),
  ('Peinado', 'Estilismo', 40, false),
  ('Tratamiento Keratina', 'Tratamiento', 90, false),
  ('Lavado + Secado', 'Básico', 20, false),
  ('Servicio Estrella', 'Premium', 120, true),
  ('Manicura', 'Estética', 30, false),
  ('Pedicura', 'Estética', 45, false);