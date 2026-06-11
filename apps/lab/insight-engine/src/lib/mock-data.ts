// ─── Compatibility re-export shim ──────────────────────────────────────────
// This file now re-exports from the canonical sources.
// Prefer importing directly from the source modules in new code:
//   Types:     @/types/domain
//   Constants: @/constants/catalog
//   Mocks:     @/data/mocks
export type { LeadStatus, CommercialPriority, EmailSendStatus, Business, ScoringBreakdown, BusinessAnalysis, DemoGeneration, OutreachEmail, LeadActivity, BusinessScrape } from "@/types/domain";
export { SECTORS, DEMO_TYPES, LEAD_STATUS_CONFIG, SCORING_LABELS } from "@/constants/catalog";
export { mockBusinesses, mockAnalysis, mockDemo, mockEmail } from "@/data/mocks";
