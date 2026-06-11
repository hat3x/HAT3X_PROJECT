// ─── Zod validation schemas for domain entities ────────────────────────────
// Used for input validation at API boundaries and form submissions.
import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────

export const LeadStatusSchema = z.enum([
  "nuevo",
  "analizado",
  "demo_generada",
  "email_preparado",
  "email_enviado",
  "interesado",
  "reunion_agendada",
  "cerrado",
  "descartado",
]);

export const CommercialPrioritySchema = z.enum(["alta", "media", "baja"]);

export const EmailSendStatusSchema = z.enum(["borrador", "enviado", "fallido"]);

// ── Form schemas ───────────────────────────────────────────────────────────

/** Input form for creating a new analysis */
export const NewAnalysisFormSchema = z.object({
  url: z
    .string()
    .min(1, "La URL es obligatoria")
    .url("Introduce una URL válida (ej: https://ejemplo.com)"),
  name: z.string().max(120, "El nombre no puede superar 120 caracteres").optional(),
  sector: z.string().optional(),
});

export type NewAnalysisFormValues = z.infer<typeof NewAnalysisFormSchema>;

/** Outreach email editor form */
export const OutreachEmailFormSchema = z.object({
  recipient_email: z
    .string()
    .email("Introduce un email válido")
    .min(1, "El email destinatario es obligatorio"),
  subject: z
    .string()
    .min(1, "El asunto es obligatorio")
    .max(100, "El asunto no puede superar 100 caracteres"),
  body: z.string().min(1, "El cuerpo del email es obligatorio"),
});

export type OutreachEmailFormValues = z.infer<typeof OutreachEmailFormSchema>;

// ── API response schemas ───────────────────────────────────────────────────

export const ScoringBreakdownSchema = z.object({
  digital_maturity: z.number().min(0).max(100),
  pain_intensity: z.number().min(0).max(100),
  solution_fit: z.number().min(0).max(100),
  economic_potential: z.number().min(0).max(100),
  closing_ease: z.number().min(0).max(100),
});

export const BusinessAnalysisResponseSchema = z.object({
  id: z.string(),
  business_id: z.string(),
  confidence_score: z.number().min(0).max(100),
  scoring_breakdown: ScoringBreakdownSchema,
  business_type: z.string(),
  sub_type: z.string(),
  key_pain_points: z.array(z.string()),
  key_opportunities: z.array(z.string()),
  recommended_primary_demo: z.string(),
  recommended_secondary_demos: z.array(z.string()),
  recommendation_justification: z.string(),
  commercial_priority: CommercialPrioritySchema,
  closing_probability: z.number().min(0).max(100),
  estimated_economic_impact: z.string(),
  suggested_offer: z.string(),
  outreach_angle: z.string(),
  sales_approach: z.string(),
  summary_for_sales: z.string(),
  detected_services: z.array(z.string()),
  detected_channels: z.array(z.string()),
});

export const DemoConversationMessageSchema = z.object({
  role: z.enum(["ia", "cliente"]),
  message: z.string(),
});

export const DemoPayloadSchema = z.object({
  problem: z.string(),
  solution: z.string(),
  benefits: z.array(z.string()),
  cta: z.string(),
  conversation_examples: z.array(DemoConversationMessageSchema),
});
