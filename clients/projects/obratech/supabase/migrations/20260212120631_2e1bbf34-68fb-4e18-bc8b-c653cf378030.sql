
-- Allow admins to insert supplier works (permissive policy)
CREATE POLICY "Admins can insert supplier works"
ON public.supplier_works FOR INSERT
WITH CHECK (is_admin(auth.uid()));
