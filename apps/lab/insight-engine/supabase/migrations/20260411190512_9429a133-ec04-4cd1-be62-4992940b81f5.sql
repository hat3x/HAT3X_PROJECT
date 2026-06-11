
-- Create lead status enum
CREATE TYPE public.lead_status AS ENUM (
  'nuevo', 'analizado', 'demo_generada', 'email_preparado',
  'email_enviado', 'interesado', 'reunion_agendada', 'cerrado', 'descartado'
);

-- Create businesses table
CREATE TABLE public.businesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  sector TEXT,
  sub_sector TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  whatsapp TEXT,
  status lead_status NOT NULL DEFAULT 'nuevo',
  source_type TEXT DEFAULT 'manual'
);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to businesses" ON public.businesses FOR ALL USING (true) WITH CHECK (true);

-- Create business_scrapes table
CREATE TABLE public.business_scrapes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  raw_content TEXT,
  extracted_services JSONB DEFAULT '[]',
  extracted_products JSONB DEFAULT '[]',
  extracted_prices JSONB DEFAULT '[]',
  extracted_channels JSONB DEFAULT '[]',
  extracted_hours JSONB,
  extracted_socials JSONB DEFAULT '{}',
  extraction_status TEXT DEFAULT 'pending'
);

ALTER TABLE public.business_scrapes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to business_scrapes" ON public.business_scrapes FOR ALL USING (true) WITH CHECK (true);

-- Create business_analysis table
CREATE TABLE public.business_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confidence_score INTEGER,
  business_type TEXT,
  sub_type TEXT,
  key_pain_points JSONB DEFAULT '[]',
  key_opportunities JSONB DEFAULT '[]',
  recommended_primary_demo TEXT,
  recommended_secondary_demos JSONB DEFAULT '[]',
  commercial_priority TEXT DEFAULT 'media',
  suggested_offer TEXT,
  outreach_angle TEXT,
  summary_for_sales TEXT,
  analysis_json JSONB DEFAULT '{}'
);

ALTER TABLE public.business_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to business_analysis" ON public.business_analysis FOR ALL USING (true) WITH CHECK (true);

-- Create demo_generations table
CREATE TABLE public.demo_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  demo_type TEXT NOT NULL,
  demo_title TEXT NOT NULL,
  demo_summary TEXT,
  demo_payload JSONB DEFAULT '{}',
  preview_status TEXT DEFAULT 'pending',
  preview_url TEXT,
  favorite BOOLEAN DEFAULT false
);

ALTER TABLE public.demo_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to demo_generations" ON public.demo_generations FOR ALL USING (true) WITH CHECK (true);

-- Create outreach_emails table
CREATE TABLE public.outreach_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  send_mode TEXT DEFAULT 'borrador',
  send_status TEXT DEFAULT 'borrador',
  sent_at TIMESTAMP WITH TIME ZONE,
  edited_before_send BOOLEAN DEFAULT false
);

ALTER TABLE public.outreach_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to outreach_emails" ON public.outreach_emails FOR ALL USING (true) WITH CHECK (true);

-- Create lead_activity table
CREATE TABLE public.lead_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  activity_type TEXT NOT NULL,
  activity_note TEXT,
  metadata_json JSONB DEFAULT '{}'
);

ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to lead_activity" ON public.lead_activity FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add updated_at trigger to businesses
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_businesses_status ON public.businesses(status);
CREATE INDEX idx_businesses_sector ON public.businesses(sector);
CREATE INDEX idx_business_scrapes_business_id ON public.business_scrapes(business_id);
CREATE INDEX idx_business_analysis_business_id ON public.business_analysis(business_id);
CREATE INDEX idx_demo_generations_business_id ON public.demo_generations(business_id);
CREATE INDEX idx_outreach_emails_business_id ON public.outreach_emails(business_id);
CREATE INDEX idx_lead_activity_business_id ON public.lead_activity(business_id);
