// ─── Core domain types for HAT3X Demo Automator ───────────────────────────
// Single source of truth for all domain interfaces.
// Aligned with the Supabase schema in src/integrations/supabase/types.ts

export type LeadStatus =
  | "nuevo"
  | "analizado"
  | "demo_generada"
  | "email_preparado"
  | "email_enviado"
  | "interesado"
  | "reunion_agendada"
  | "cerrado"
  | "descartado";

export type CommercialPriority = "alta" | "media" | "baja";

export type EmailSendStatus = "borrador" | "enviado" | "fallido";

export interface Business {
  id: string;
  name: string;
  url: string;
  /** Canonical form of url used for deduplication. Set automatically by DB trigger. */
  url_normalized: string | null;
  sector: string | null;
  sub_sector: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  source_type: string | null;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

export interface ScoringBreakdown {
  digital_maturity: number;
  pain_intensity: number;
  solution_fit: number;
  economic_potential: number;
  closing_ease: number;
}

export interface BusinessAnalysis {
  id: string;
  business_id: string;
  confidence_score: number;
  scoring_breakdown: ScoringBreakdown;
  business_type: string;
  sub_type: string;
  key_pain_points: string[];
  key_opportunities: string[];
  recommended_primary_demo: string;
  recommended_secondary_demos: string[];
  recommendation_justification: string;
  commercial_priority: CommercialPriority;
  closing_probability: number;
  estimated_economic_impact: string;
  suggested_offer: string;
  outreach_angle: string;
  sales_approach: string;
  summary_for_sales: string;
  detected_services: string[];
  detected_channels: string[];
  created_at?: string;
}

export interface DemoConversationMessage {
  role: "ia" | "cliente";
  message: string;
}

export interface DemoPayload {
  problem: string;
  solution: string;
  benefits: string[];
  cta: string;
  conversation_examples: DemoConversationMessage[];
}

export interface DemoGeneration {
  id: string;
  business_id: string;
  demo_type: string;
  demo_title: string;
  demo_summary: string;
  favorite: boolean;
  preview_status: string | null;
  preview_url: string | null;
  created_at: string;
  demo_payload: DemoPayload;
}

export interface OutreachEmail {
  id: string;
  business_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  preheader: string | null;
  send_status: EmailSendStatus;
  send_mode: string | null;
  edited_before_send: boolean | null;
  sent_at: string | null;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  business_id: string;
  activity_type: string;
  activity_note: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface BusinessScrape {
  id: string;
  business_id: string;
  raw_content: string | null;
  extracted_services: string[] | null;
  extracted_channels: string[] | null;
  extracted_socials: Record<string, string> | null;
  extracted_hours: Record<string, string> | null;
  extracted_prices: string[] | null;
  extracted_products: string[] | null;
  extraction_status: "pending" | "completed" | "failed" | null;
  created_at: string;
}
