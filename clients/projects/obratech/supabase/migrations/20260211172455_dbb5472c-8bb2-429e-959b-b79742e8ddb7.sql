
DROP POLICY "Employees can update assigned tasks" ON public.tasks;

CREATE POLICY "Employees can update project tasks"
ON public.tasks
FOR UPDATE
USING (is_project_member(auth.uid(), project_id));
