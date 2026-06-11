
-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;

-- USER_ROLES policies
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) OR id = auth.uid());

-- COMPANIES policies
CREATE POLICY "Admins can manage companies" ON public.companies FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Clients can view own company" ON public.companies FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.company_users WHERE company_users.company_id = companies.id AND company_users.user_id = auth.uid()));

-- COMPANY_USERS policies
CREATE POLICY "Admins can manage company_users" ON public.company_users FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view own company links" ON public.company_users FOR SELECT TO authenticated USING (user_id = auth.uid());

-- PROJECTS policies
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Clients can view own projects" ON public.projects FOR SELECT TO authenticated USING (visible_to_client = true AND EXISTS (SELECT 1 FROM public.company_users WHERE company_users.company_id = projects.company_id AND company_users.user_id = auth.uid()));

-- PROJECT_PHASES policies
CREATE POLICY "Admins can manage phases" ON public.project_phases FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Clients can view visible phases" ON public.project_phases FOR SELECT TO authenticated USING (visible_to_client = true AND EXISTS (SELECT 1 FROM public.projects p JOIN public.company_users cu ON cu.company_id = p.company_id WHERE p.id = project_phases.project_id AND cu.user_id = auth.uid() AND p.visible_to_client = true));

-- MILESTONES policies
CREATE POLICY "Admins can manage milestones" ON public.milestones FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Clients can view visible milestones" ON public.milestones FOR SELECT TO authenticated USING (visible_to_client = true AND EXISTS (SELECT 1 FROM public.projects p JOIN public.company_users cu ON cu.company_id = p.company_id WHERE p.id = milestones.project_id AND cu.user_id = auth.uid() AND p.visible_to_client = true));

-- TASKS policies
CREATE POLICY "Admins can manage tasks" ON public.tasks FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Clients can view visible tasks" ON public.tasks FOR SELECT TO authenticated USING (visible_to_client = true AND EXISTS (SELECT 1 FROM public.projects p JOIN public.company_users cu ON cu.company_id = p.company_id WHERE p.id = tasks.project_id AND cu.user_id = auth.uid() AND p.visible_to_client = true));

-- PROJECT_UPDATES policies
CREATE POLICY "Admins can manage updates" ON public.project_updates FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Clients can view published updates" ON public.project_updates FOR SELECT TO authenticated USING (status = 'published' AND EXISTS (SELECT 1 FROM public.projects p JOIN public.company_users cu ON cu.company_id = p.company_id WHERE p.id = project_updates.project_id AND cu.user_id = auth.uid() AND p.visible_to_client = true));

-- FILES policies
CREATE POLICY "Admins can manage files" ON public.files FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Clients can view visible files" ON public.files FOR SELECT TO authenticated USING (visible_to_client = true AND (EXISTS (SELECT 1 FROM public.projects p JOIN public.company_users cu ON cu.company_id = p.company_id WHERE p.id = files.project_id AND cu.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = files.company_id AND cu.user_id = auth.uid())));

-- CONVERSATIONS policies
CREATE POLICY "Admins can manage conversations" ON public.conversations FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Clients can manage own conversations" ON public.conversations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = conversations.company_id AND cu.user_id = auth.uid()));

-- MESSAGES policies
CREATE POLICY "Admins can manage messages" ON public.messages FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Conversation participants can manage messages" ON public.messages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c JOIN public.company_users cu ON cu.company_id = c.company_id WHERE c.id = messages.conversation_id AND cu.user_id = auth.uid()));

-- INTERNAL NOTES policies (admin only)
CREATE POLICY "Only admins can manage internal notes" ON public.internal_notes FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Storage policies
CREATE POLICY "Admins can manage all storage files" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'project-files' AND public.is_admin(auth.uid()));
CREATE POLICY "Clients can view own storage files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-files' AND EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid()));
