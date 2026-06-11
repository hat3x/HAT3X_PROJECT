CREATE POLICY "Franchisee views own locales"
ON public.locales
FOR SELECT
TO authenticated
USING (franchisee_id = public.get_user_franchisee_id(auth.uid()));

CREATE POLICY "Franchisee updates own locales"
ON public.locales
FOR UPDATE
TO authenticated
USING (franchisee_id = public.get_user_franchisee_id(auth.uid()))
WITH CHECK (franchisee_id = public.get_user_franchisee_id(auth.uid()));