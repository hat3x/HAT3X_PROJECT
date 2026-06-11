
-- Create section enum
CREATE TYPE public.salon_section AS ENUM ('CABALLEROS', 'SENORAS');

-- Create staff_members table
CREATE TABLE public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location_id uuid REFERENCES public.locations(id) NOT NULL,
  section salon_section NOT NULL,
  avatar_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- All authenticated can read staff
CREATE POLICY "Staff members readable by all authenticated"
  ON public.staff_members FOR SELECT TO authenticated
  USING (true);

-- Add section to services
ALTER TABLE public.services ADD COLUMN section salon_section;

-- Add staff_member_id to appointments
ALTER TABLE public.appointments ADD COLUMN staff_member_id uuid REFERENCES public.staff_members(id);
