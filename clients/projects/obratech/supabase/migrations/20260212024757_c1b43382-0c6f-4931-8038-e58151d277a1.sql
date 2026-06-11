
-- Drop all existing notification policies
DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Admins can manage notifications"
ON public.notifications
FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Users can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (target_user_id = auth.uid());

CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (target_user_id = auth.uid());
