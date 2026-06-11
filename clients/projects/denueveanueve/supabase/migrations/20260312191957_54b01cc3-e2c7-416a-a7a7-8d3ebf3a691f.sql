ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS application_min integer,
  ADD COLUMN IF NOT EXISTS exposure_min integer,
  ADD COLUMN IF NOT EXISTS post_exposure_min integer;