// ─── Outreach / email service ───────────────────────────────────────────────
// Generates and manages commercial outreach emails:
// - Generate personalized email from analysis data
// - Save drafts
// - Send via configured provider (Resend, Gmail API, n8n webhook)
//
// Phase 6 will implement real email sending.
// Phase 1 stub defines the contract.
import type { BusinessAnalysis, OutreachEmail } from "@/types/domain";

export interface EmailGenerationInput {
  business_id: string;
  business_name: string;
  business_url: string;
  business_email?: string | null;
  analysis: Pick<
    BusinessAnalysis,
    | "summary_for_sales"
    | "key_pain_points"
    | "estimated_economic_impact"
    | "suggested_offer"
    | "outreach_angle"
  >;
}

export interface EmailGenerationResult {
  email: OutreachEmail;
}

export type EmailSendProvider = "resend" | "gmail" | "n8n" | "clipboard";

export interface EmailSendInput {
  email_id: string;
  provider: EmailSendProvider;
}

/**
 * Generates a personalized commercial email for a business.
 *
 * Future: uses AI to generate subject + body based on analysis context.
 * Currently delegates to Supabase Edge Function `generate-email`.
 */
export async function generateOutreachEmail(_input: EmailGenerationInput): Promise<EmailGenerationResult> {
  // TODO Phase 6: implement AI email generation
  throw new Error("generateOutreachEmail: not implemented — use Supabase Edge Function in Phase 1");
}

/**
 * Sends an email via the configured provider.
 *
 * Phase 6 will implement real sending via Resend, Gmail API, or n8n.
 */
export async function sendEmail(_input: EmailSendInput): Promise<void> {
  // TODO Phase 6: implement sending
  throw new Error("sendEmail: not implemented in Phase 1");
}
