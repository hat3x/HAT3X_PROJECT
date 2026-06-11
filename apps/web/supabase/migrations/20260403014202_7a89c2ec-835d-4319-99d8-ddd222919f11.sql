
-- Delete policies for admin on all project-related tables
CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete conversations" ON public.conversations FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete messages" ON public.messages FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete tasks" ON public.tasks FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete milestones" ON public.milestones FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete phases" ON public.project_phases FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete updates" ON public.project_updates FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete files" ON public.files FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete internal_notes" ON public.internal_notes FOR DELETE TO authenticated USING (is_admin(auth.uid()));
