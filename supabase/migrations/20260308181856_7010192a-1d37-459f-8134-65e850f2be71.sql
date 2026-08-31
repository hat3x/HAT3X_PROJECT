
ALTER TABLE public.visit_pins 
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid,
  ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false;
