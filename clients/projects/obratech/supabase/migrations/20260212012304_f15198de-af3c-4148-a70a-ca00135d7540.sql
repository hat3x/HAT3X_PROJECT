
-- 1. Add supplier_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS supplier_id text;

-- 2. Helper functions for role checks
CREATE OR REPLACE FUNCTION public.is_employee(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = uid AND role = 'employee'); $$;

CREATE OR REPLACE FUNCTION public.is_supplier(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = uid AND role = 'supplier'); $$;

-- 3. Create supplier_works table
CREATE TABLE public.supplier_works (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz
);

ALTER TABLE public.supplier_works ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access supplier_works"
ON public.supplier_works FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Suppliers can view own works"
ON public.supplier_works FOR SELECT
USING (supplier_user_id = auth.uid());

CREATE POLICY "Suppliers can update own works"
ON public.supplier_works FOR UPDATE
USING (supplier_user_id = auth.uid());

-- 4. Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notifications"
ON public.notifications FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Storage bucket for work photos
INSERT INTO storage.buckets (id, name, public) VALUES ('work-photos', 'work-photos', false);

CREATE POLICY "Authenticated can upload work photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'work-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can view work photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'work-photos' AND auth.uid() IS NOT NULL);

-- 6. Allow employees to insert and delete tasks
CREATE POLICY "Employees can insert project tasks"
ON public.tasks FOR INSERT
WITH CHECK (is_project_member(auth.uid(), project_id));

CREATE POLICY "Employees can delete project tasks"
ON public.tasks FOR DELETE
USING (is_project_member(auth.uid(), project_id));

-- 7. Suppliers can view their assigned projects (via project_members)
-- Already handled by existing "Employees can view assigned projects" policy since it uses is_project_member
