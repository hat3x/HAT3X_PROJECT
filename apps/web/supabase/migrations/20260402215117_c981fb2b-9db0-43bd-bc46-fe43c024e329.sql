
-- Add client_id column to profiles for custom login
ALTER TABLE public.profiles ADD COLUMN client_id text UNIQUE;

-- Create index for fast lookup
CREATE INDEX idx_profiles_client_id ON public.profiles(client_id) WHERE client_id IS NOT NULL;
