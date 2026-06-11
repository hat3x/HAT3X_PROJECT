
-- Profiles table
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'employee', 'client')),
  employee_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  due_date TIMESTAMPTZ,
  client_id UUID
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Project members table
CREATE TABLE public.project_members (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'worker',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  assigned_to UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Materials table
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'ordered', 'delivered')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Project plans table
CREATE TABLE public.project_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_plans ENABLE ROW LEVEL SECURITY;

-- Time entries table
CREATE TABLE public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Security definer functions
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = uid AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(uid UUID, pid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE user_id = uid AND project_id = pid);
$$;

CREATE OR REPLACE FUNCTION public.is_project_client(uid UUID, pid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = pid AND client_id = uid);
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, role)
  VALUES (NEW.id, NEW.email, 'client');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- projects
CREATE POLICY "Admins can do everything with projects" ON public.projects FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Employees can view assigned projects" ON public.projects FOR SELECT USING (public.is_project_member(auth.uid(), id));
CREATE POLICY "Clients can view their projects" ON public.projects FOR SELECT USING (client_id = auth.uid());

-- project_members
CREATE POLICY "Admins can manage project members" ON public.project_members FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Members can view project members" ON public.project_members FOR SELECT USING (public.is_project_member(auth.uid(), project_id));

-- tasks
CREATE POLICY "Admins can do everything with tasks" ON public.tasks FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Employees can view project tasks" ON public.tasks FOR SELECT USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Employees can update assigned tasks" ON public.tasks FOR UPDATE USING (public.get_user_role(auth.uid()) = 'employee' AND assigned_to = auth.uid());
CREATE POLICY "Clients can view their project tasks" ON public.tasks FOR SELECT USING (public.is_project_client(auth.uid(), project_id));

-- materials
CREATE POLICY "Admins can do everything with materials" ON public.materials FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Employees can view project materials" ON public.materials FOR SELECT USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Employees can insert materials" ON public.materials FOR INSERT WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Employees can update materials" ON public.materials FOR UPDATE USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Employees can delete materials" ON public.materials FOR DELETE USING (public.is_project_member(auth.uid(), project_id));

-- project_plans
CREATE POLICY "Admins can manage plans" ON public.project_plans FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Employees can view plans" ON public.project_plans FOR SELECT USING (public.is_project_member(auth.uid(), project_id));

-- time_entries
CREATE POLICY "Admins can view all time entries" ON public.time_entries FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Employees can view own entries" ON public.time_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Employees can insert own entries" ON public.time_entries FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Employees can update own open entries" ON public.time_entries FOR UPDATE USING (user_id = auth.uid() AND clock_out IS NULL);

-- Storage bucket for plans
INSERT INTO storage.buckets (id, name, public) VALUES ('plans', 'plans', false);

CREATE POLICY "Admins can manage plan files" ON storage.objects FOR ALL USING (bucket_id = 'plans' AND public.is_admin(auth.uid()));
CREATE POLICY "Employees can view plan files" ON storage.objects FOR SELECT USING (bucket_id = 'plans' AND public.get_user_role(auth.uid()) = 'employee');
