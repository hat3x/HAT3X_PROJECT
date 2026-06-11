ALTER TABLE public.business_analysis
  ADD COLUMN IF NOT EXISTS detected_services jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS detected_channels jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scoring_breakdown jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recommendation_justification text,
  ADD COLUMN IF NOT EXISTS estimated_economic_impact text,
  ADD COLUMN IF NOT EXISTS closing_probability integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_approach text;