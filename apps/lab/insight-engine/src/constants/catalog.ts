// ─── Product catalog constants ─────────────────────────────────────────────
import type { LeadStatus, ScoringBreakdown } from "@/types/domain";

export const SECTORS = [
  "Restaurante",
  "Clínica dental",
  "Gimnasio",
  "Peluquería / Estética",
  "Comercio local",
  "Inmobiliaria",
  "Taller mecánico",
  "Hotel",
  "Otro",
] as const;

export type Sector = (typeof SECTORS)[number];

export const DEMO_TYPES = [
  { id: "recepcionista_ia", label: "Recepcionista IA", icon: "🤖" },
  { id: "reservas_citas", label: "Reservas / Citas", icon: "📅" },
  { id: "captacion_leads", label: "Captación de leads", icon: "🎯" },
  { id: "asistente_ventas", label: "Asistente de ventas", icon: "💼" },
  { id: "chatbot", label: "Chatbot web/WhatsApp", icon: "💬" },
  { id: "atencion_automatizada", label: "Atención automatizada", icon: "⚡" },
  { id: "recuperacion_llamadas", label: "Recuperación de llamadas", icon: "📞" },
  { id: "mini_ecommerce", label: "Mini ecommerce", icon: "🛒" },
  { id: "fidelizacion", label: "Fidelización", icon: "❤️" },
  { id: "onboarding", label: "Onboarding automatizado", icon: "🚀" },
] as const;

export type DemoTypeId = (typeof DEMO_TYPES)[number]["id"];

export const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  nuevo: { label: "Nuevo", color: "bg-blue-500/20 text-blue-400" },
  analizado: { label: "Analizado", color: "bg-purple-glow/20 text-purple-400" },
  demo_generada: { label: "Demo generada", color: "bg-orange-glow/20 text-orange-400" },
  email_preparado: { label: "Email preparado", color: "bg-yellow-500/20 text-yellow-400" },
  email_enviado: { label: "Email enviado", color: "bg-cyan-500/20 text-cyan-400" },
  interesado: { label: "Interesado", color: "bg-green-500/20 text-green-400" },
  reunion_agendada: { label: "Reunión agendada", color: "bg-emerald-500/20 text-emerald-400" },
  cerrado: { label: "Cerrado", color: "bg-success/20 text-green-300" },
  descartado: { label: "Descartado", color: "bg-red-500/20 text-red-400" },
};

export const SCORING_LABELS: Record<keyof ScoringBreakdown, { label: string; description: string }> = {
  digital_maturity: {
    label: "Oportunidad digital",
    description: "Menor madurez digital = mayor oportunidad",
  },
  pain_intensity: {
    label: "Intensidad del dolor",
    description: "Cuánto le duele el problema actual",
  },
  solution_fit: {
    label: "Encaje de solución",
    description: "Qué tan bien encajan nuestras soluciones",
  },
  economic_potential: {
    label: "Potencial económico",
    description: "Impacto económico estimado",
  },
  closing_ease: {
    label: "Facilidad de cierre",
    description: "Probabilidad de cerrar la venta",
  },
};
