-- Allow suppliers to read notifications where they are the target (created_by is the admin, but we need notifications targeted at suppliers)
-- We'll add a target_user_id column to notifications so we can target specific users
ALTER TABLE public.notifications ADD COLUMN target_user_id uuid DEFAULT NULL;

-- Suppliers can view notifications targeted at them
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (target_user_id = auth.uid());

-- Suppliers can mark their own notifications as read  
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (target_user_id = auth.uid());