
-- Fix 1: Add INSERT policy for employees on project_plans
CREATE POLICY "Employees can upload plans"
ON public.project_plans FOR INSERT
WITH CHECK (is_project_member(auth.uid(), project_id));

-- Fix 2: Ensure profiles table requires authentication for all access
-- The existing policies are RESTRICTIVE, so we need a PERMISSIVE base policy
-- that requires authentication. Let's add an explicit auth requirement.
CREATE POLICY "Require authentication for profiles"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);
