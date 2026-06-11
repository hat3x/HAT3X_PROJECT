
-- Create rate limiting table for login attempts
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  attempted_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_login_attempts_identifier_time ON public.login_attempts (identifier, attempted_at DESC);

-- Enable RLS and block all client access (only service role uses this)
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup old entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '1 hour';
$$;
