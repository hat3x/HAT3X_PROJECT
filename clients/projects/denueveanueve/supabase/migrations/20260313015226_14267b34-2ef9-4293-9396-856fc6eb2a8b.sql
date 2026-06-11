CREATE POLICY "Customers can read employee schedules"
ON public.employee_schedules
FOR SELECT
TO authenticated
USING (true);