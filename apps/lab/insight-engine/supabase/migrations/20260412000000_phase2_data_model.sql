-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Data model hardening
-- URL normalization, data integrity constraints, performance indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. URL normalization function ────────────────────────────────────────────

-- Produces a canonical key from a raw URL for deduplication:
--   https://Trattoria.com/ → trattoria.com
--   http://www.trattoria.com → trattoria.com
--   HTTPS://TRATTORIA.COM/menu → trattoria.com/menu
CREATE OR REPLACE FUNCTION public.normalize_url(raw_url TEXT)
RETURNS TEXT AS $$
DECLARE
  normalized TEXT;
BEGIN
  -- Lowercase and trim whitespace
  normalized := lower(trim(raw_url));
  -- Remove protocol
  normalized := regexp_replace(normalized, '^https?://', '');
  -- Remove www. prefix
  normalized := regexp_replace(normalized, '^www\.', '');
  -- Remove trailing slash
  normalized := rtrim(normalized, '/');
  RETURN normalized;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public;

-- ── 2. url_normalized column on businesses ────────────────────────────────────

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS url_normalized TEXT;

-- Backfill existing rows
UPDATE public.businesses
  SET url_normalized = public.normalize_url(url)
  WHERE url_normalized IS NULL;

-- Unique constraint on normalized URL (softer dedup than raw url UNIQUE)
-- Drop the raw url unique constraint if it exists, we'll enforce via url_normalized instead
-- Note: We keep the original url column (user-submitted value) for display; url_normalized for dedup.
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_url_normalized_key UNIQUE (url_normalized);

-- ── 3. Trigger to auto-set url_normalized on INSERT/UPDATE ───────────────────

CREATE OR REPLACE FUNCTION public.set_url_normalized()
RETURNS TRIGGER AS $$
BEGIN
  NEW.url_normalized := public.normalize_url(NEW.url);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS businesses_normalize_url ON public.businesses;
CREATE TRIGGER businesses_normalize_url
  BEFORE INSERT OR UPDATE OF url ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_url_normalized();

-- ── 4. Data integrity constraints ────────────────────────────────────────────

-- business_analysis: bounded integer scores
ALTER TABLE public.business_analysis
  ADD CONSTRAINT check_confidence_score
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  ADD CONSTRAINT check_closing_probability
    CHECK (closing_probability IS NULL OR (closing_probability >= 0 AND closing_probability <= 100)),
  ADD CONSTRAINT check_commercial_priority
    CHECK (commercial_priority IS NULL OR commercial_priority IN ('alta', 'media', 'baja'));

-- business_scrapes: constrain extraction_status
ALTER TABLE public.business_scrapes
  ADD CONSTRAINT check_extraction_status
    CHECK (extraction_status IS NULL OR extraction_status IN ('pending', 'processing', 'completed', 'failed'));

-- outreach_emails: constrain send_status
ALTER TABLE public.outreach_emails
  ADD CONSTRAINT check_send_status
    CHECK (send_status IS NULL OR send_status IN ('borrador', 'enviado', 'fallido'));

-- ── 5. preheader column on outreach_emails ────────────────────────────────────

ALTER TABLE public.outreach_emails
  ADD COLUMN IF NOT EXISTS preheader TEXT;

-- ── 6. Performance indexes ────────────────────────────────────────────────────

-- Businesses: common sort order is created_at DESC
CREATE INDEX IF NOT EXISTS idx_businesses_created_at
  ON public.businesses(created_at DESC);

-- Businesses: dashboard filter: status + created_at
CREATE INDEX IF NOT EXISTS idx_businesses_status_created_at
  ON public.businesses(status, created_at DESC);

-- Businesses: url_normalized for fast dedup lookup
CREATE INDEX IF NOT EXISTS idx_businesses_url_normalized
  ON public.businesses(url_normalized);

-- business_analysis: latest analysis per business
CREATE INDEX IF NOT EXISTS idx_business_analysis_created_at
  ON public.business_analysis(business_id, created_at DESC);

-- demo_generations: latest demo per business
CREATE INDEX IF NOT EXISTS idx_demo_generations_created_at
  ON public.demo_generations(business_id, created_at DESC);

-- outreach_emails: latest email per business
CREATE INDEX IF NOT EXISTS idx_outreach_emails_created_at
  ON public.outreach_emails(business_id, created_at DESC);

-- lead_activity: latest activity per business
CREATE INDEX IF NOT EXISTS idx_lead_activity_created_at
  ON public.lead_activity(business_id, created_at DESC);

-- ── 7. Dashboard stats view ───────────────────────────────────────────────────

-- Efficient aggregate for the dashboard without hitting all rows in app code
CREATE OR REPLACE VIEW public.lead_stats AS
SELECT
  count(*) FILTER (WHERE status != 'descartado')                AS total_active,
  count(*) FILTER (WHERE status = 'nuevo')                      AS total_new,
  count(*) FILTER (WHERE status = 'analizado')                  AS total_analyzed,
  count(*) FILTER (WHERE status = 'demo_generada')              AS total_demo,
  count(*) FILTER (WHERE status IN ('email_preparado', 'email_enviado')) AS total_email,
  count(*) FILTER (WHERE status IN ('interesado', 'reunion_agendada')) AS total_hot,
  count(*) FILTER (WHERE status = 'cerrado')                    AS total_won,
  count(*) FILTER (WHERE status = 'descartado')                 AS total_lost
FROM public.businesses;

-- RLS on view: internal tool, same open policy
-- Views inherit table RLS automatically in Supabase

-- ── 8. Log activity on status change ─────────────────────────────────────────

-- Auto-log a lead_activity record whenever business status changes
CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.lead_activity (business_id, activity_type, activity_note, metadata_json)
    VALUES (
      NEW.id,
      'status_change',
      'Estado cambiado de ' || OLD.status || ' a ' || NEW.status,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS businesses_log_status_change ON public.businesses;
CREATE TRIGGER businesses_log_status_change
  AFTER UPDATE OF status ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();
