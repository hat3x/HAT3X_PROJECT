// ─── Analysis service ───────────────────────────────────────────────────────
// Orchestrates the full business analysis pipeline:
// 1. Trigger scraping (via scraping service)
// 2. Run AI analysis (via Supabase Edge Function or external AI API)
// 3. Persist results
// 4. Return structured output
//
// Phase 2 will implement the real logic here.
// Phase 1 stub defines the contract.
import type { BusinessAnalysis } from "@/types/domain";

export interface AnalysisInput {
  business_id: string;
  url: string;
  name: string;
  sector?: string;
}

export interface AnalysisResult {
  analysis: BusinessAnalysis;
  /** Raw edge function response for debugging */
  raw?: unknown;
}

/**
 * Runs the full analysis pipeline for a business.
 * Currently delegates to the Supabase Edge Function `analyze-business`.
 *
 * Future: can be replaced with a local pipeline or a different AI provider.
 */
export async function analyzeBusinessUrl(_input: AnalysisInput): Promise<AnalysisResult> {
  // TODO Phase 2: implement real pipeline
  // - call scraping service
  // - call AI analysis
  // - validate and persist
  throw new Error("analyzeBusinessUrl: not implemented — use Supabase Edge Function directly in Phase 1");
}
