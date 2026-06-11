
-- 1. Add created_at to materials for stable ordering
ALTER TABLE public.materials ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

-- 2. Fix time_entries update RLS: the old policy uses clock_out IS NULL in USING,
-- which also applies as WITH CHECK, blocking the update that sets clock_out.
DROP POLICY "Employees can update own open entries" ON public.time_entries;

CREATE POLICY "Employees can update own open entries"
ON public.time_entries
FOR UPDATE
USING (user_id = auth.uid() AND clock_out IS NULL)
WITH CHECK (user_id = auth.uid());
