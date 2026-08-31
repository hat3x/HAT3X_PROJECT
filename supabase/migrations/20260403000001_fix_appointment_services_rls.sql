-- Fix: appointment_services SELECT policy was exposing all appointments to any authenticated user.
-- The old USING clause only checked `appointment_id IN (SELECT id FROM appointments)` without
-- filtering by the current user, effectively leaking all appointment_services to any logged-in user.

DROP POLICY IF EXISTS "Appointment services follow appointment access" ON public.appointment_services;

CREATE POLICY "Appointment services follow appointment access"
ON public.appointment_services
FOR SELECT
TO authenticated
USING (
  appointment_id IN (
    SELECT a.id
    FROM public.appointments a
    JOIN public.customers c ON a.customer_id = c.id
    WHERE c.user_id = auth.uid()
  )
);
