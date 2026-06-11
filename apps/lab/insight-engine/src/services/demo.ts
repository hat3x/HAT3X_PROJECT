// ─── Demo generation service ────────────────────────────────────────────────
// Converts a business analysis into a commercial demo:
// - Selects the best demo type
// - Generates problem/solution narrative
// - Creates conversation examples
// - Produces the demo payload
//
// Phase 5 will implement the real logic.
// Phase 1 stub defines the contract.
import type { BusinessAnalysis, DemoGeneration } from "@/types/domain";

export interface DemoGenerationInput {
  business_id: string;
  analysis: BusinessAnalysis;
  demo_type?: string; // override recommended type
}

export interface DemoGenerationResult {
  demo: DemoGeneration;
}

/**
 * Generates a personalized commercial demo for a business.
 *
 * Future: uses demo templates + AI to personalize problem/solution/benefits.
 * Should support multiple demo types and regeneration with different focus.
 */
export async function generateDemo(_input: DemoGenerationInput): Promise<DemoGenerationResult> {
  // TODO Phase 5: implement demo generation
  // - select template by demo_type and sector
  // - personalize with analysis data (pain points, services, etc.)
  // - generate conversation examples
  // - persist to demo_generations table
  throw new Error("generateDemo: not implemented in Phase 1");
}
