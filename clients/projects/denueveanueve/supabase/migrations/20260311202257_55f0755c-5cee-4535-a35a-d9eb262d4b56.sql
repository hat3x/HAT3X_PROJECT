
-- Allow customers to INSERT appointment_services for their own appointments
CREATE POLICY "Customers can insert own appointment services"
ON public.appointment_services
FOR INSERT
TO authenticated
WITH CHECK (
  appointment_id IN (
    SELECT a.id FROM appointments a
    JOIN customers c ON c.id = a.customer_id
    WHERE c.user_id = auth.uid()
  )
);
