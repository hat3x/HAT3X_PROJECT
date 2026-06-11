
-- 1. Service categories table
CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service categories readable by all authenticated"
  ON public.service_categories FOR SELECT TO authenticated
  USING (true);

-- 2. Add new columns to services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS base_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS fixed_points integer,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.service_categories(id);

-- 3. Extend appointment_services with snapshot columns
ALTER TABLE public.appointment_services
  ADD COLUMN IF NOT EXISTS service_name_snapshot text,
  ADD COLUMN IF NOT EXISTS price_type_snapshot text,
  ADD COLUMN IF NOT EXISTS unit_price_snapshot numeric(10,2),
  ADD COLUMN IF NOT EXISTS duration_minutes_snapshot integer,
  ADD COLUMN IF NOT EXISTS points_snapshot integer,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS final_points integer;

-- 4. Extend appointments with estimation/verification fields
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS estimated_total_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS estimated_total_duration integer,
  ADD COLUMN IF NOT EXISTS estimated_pending_points integer,
  ADD COLUMN IF NOT EXISTS final_total_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS final_total_points integer,
  ADD COLUMN IF NOT EXISTS verified_by_staff_id uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS points_awarded boolean NOT NULL DEFAULT false;

-- 5. Loyalty transactions ledger
CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id),
  type text NOT NULL, -- 'earn', 'redeem', 'adjust'
  points integer NOT NULL,
  description text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own loyalty transactions"
  ON public.loyalty_transactions FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

CREATE POLICY "Staff can manage loyalty transactions"
  ON public.loyalty_transactions FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- 6. QR scan logs
CREATE TABLE public.qr_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id),
  scanned_by_staff_id uuid,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL -- 'verified', 'already_verified', 'no_appointment', etc.
);

ALTER TABLE public.qr_scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage scan logs"
  ON public.qr_scan_logs FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
