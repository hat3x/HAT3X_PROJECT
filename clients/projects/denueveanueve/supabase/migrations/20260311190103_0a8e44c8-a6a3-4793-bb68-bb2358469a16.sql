CREATE TABLE public.staff_calendar_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_member_id)
);

ALTER TABLE public.staff_calendar_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff calendar mappings readable by authenticated"
  ON public.staff_calendar_mappings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins/managers can manage calendar mappings"
  ON public.staff_calendar_mappings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));