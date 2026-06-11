// ─── Realistic mock data for development and demo purposes ─────────────────
// These mocks mirror the shape that real Supabase data would return.
// Replace with real queries when backend is connected.
import type { Business, BusinessAnalysis, DemoGeneration, OutreachEmail } from "@/types/domain";

export const mockBusinesses: Business[] = [
  {
    id: "1",
    name: "Trattoria Milano",
    url: "https://trattoriamilano.es",
    url_normalized: "trattoriamilano.es",
    sector: "Restaurante",
    sub_sector: "Italiano",
    city: "Madrid",
    phone: "+34 612 345 678",
    email: "info@trattoriamilano.es",
    whatsapp: null,
    source_type: "manual",
    status: "demo_generada",
    created_at: "2024-01-15T10:30:00Z",
    updated_at: "2024-01-15T14:00:00Z",
  },
  {
    id: "2",
    name: "Clínica Dental Sonrisa",
    url: "https://clinicasonrisa.com",
    url_normalized: "clinicasonrisa.com",
    sector: "Clínica dental",
    sub_sector: "Odontología general",
    city: "Barcelona",
    phone: "+34 623 456 789",
    email: "contacto@clinicasonrisa.com",
    whatsapp: null,
    source_type: "manual",
    status: "email_enviado",
    created_at: "2024-01-14T09:00:00Z",
    updated_at: "2024-01-15T11:00:00Z",
  },
  {
    id: "3",
    name: "FitZone Gym",
    url: "https://fitzonegym.es",
    url_normalized: "fitzonegym.es",
    sector: "Gimnasio",
    sub_sector: "CrossFit",
    city: "Valencia",
    phone: "+34 634 567 890",
    email: "hola@fitzonegym.es",
    whatsapp: null,
    source_type: "manual",
    status: "analizado",
    created_at: "2024-01-13T15:00:00Z",
    updated_at: "2024-01-14T10:00:00Z",
  },
  {
    id: "4",
    name: "Estética Bella Vida",
    url: "https://bellavida.es",
    url_normalized: "bellavida.es",
    sector: "Peluquería / Estética",
    sub_sector: "Centro de estética",
    city: "Sevilla",
    phone: "+34 645 678 901",
    email: "citas@bellavida.es",
    whatsapp: null,
    source_type: "manual",
    status: "nuevo",
    created_at: "2024-01-15T16:00:00Z",
    updated_at: "2024-01-15T16:00:00Z",
  },
  {
    id: "5",
    name: "Delicias del Sur",
    url: "https://deliciasdelsur.com",
    url_normalized: "deliciasdelsur.com",
    sector: "Comercio local",
    sub_sector: "Tienda gourmet",
    city: "Málaga",
    phone: "+34 656 789 012",
    email: "pedidos@deliciasdelsur.com",
    whatsapp: null,
    source_type: "manual",
    status: "interesado",
    created_at: "2024-01-10T08:00:00Z",
    updated_at: "2024-01-15T09:00:00Z",
  },
];

export const mockAnalysis: BusinessAnalysis = {
  id: "a1",
  business_id: "1",
  confidence_score: 87,
  scoring_breakdown: {
    digital_maturity: 82,
    pain_intensity: 90,
    solution_fit: 95,
    economic_potential: 85,
    closing_ease: 78,
  },
  business_type: "Restaurante",
  sub_type: "Italiano - Casual dining",
  key_pain_points: [
    "Pierde ~20 reservas/semana por llamadas no atendidas en horas punta (impacto estimado: 2.000-3.000€/mes)",
    "Depende al 100% del teléfono para reservas — cero digitalización",
    "No capta datos de clientes: pierde oportunidades de eventos y celebraciones recurrentes",
    "Sin presencia de chatbot ni asistente virtual — respuestas lentas a consultas frecuentes",
    "No tiene sistema de recordatorios — tasa de no-show probablemente alta",
  ],
  key_opportunities: [
    "Recepcionista IA 24/7: capturar las ~80 llamadas mensuales perdidas = +3.000-5.000€/mes en reservas recuperadas",
    "Captación automática de eventos y celebraciones: ticket medio de grupo 3-5x mayor que reserva individual",
    "Sistema de recordatorios automatizados: reducir no-shows un 60-70%, liberando mesas",
    "Atención instantánea sobre menú/horario/ubicación: eliminar el 70% de llamadas repetitivas",
    "Base de datos de clientes para campañas de fidelización y reactivación",
  ],
  recommended_primary_demo: "recepcionista_ia",
  recommended_secondary_demos: ["reservas_citas", "captacion_leads"],
  recommendation_justification:
    "Trattoria Milano tiene una dependencia TOTAL del teléfono para reservas, lo que genera un cuello de botella visible en horas punta. Una recepcionista IA resuelve su dolor más costoso (llamadas perdidas = reservas perdidas = dinero perdido) con un ROI inmediato y demostrable.",
  commercial_priority: "alta",
  closing_probability: 75,
  estimated_economic_impact:
    "Recuperación estimada de 15-25 reservas perdidas al mes, equivalente a 3.000-5.000€/mes en ingresos adicionales. ROI de la inversión en menos de 2 semanas.",
  suggested_offer: "Recepcionista IA + Sistema de reservas automatizado con periodo de prueba de 14 días",
  outreach_angle:
    "Hemos detectado que Trattoria Milano podría estar perdiendo hasta 5.000€/mes en reservas no atendidas. Hemos preparado una demo gratuita de cómo solucionarlo.",
  sales_approach:
    "Abrir con dato de impacto económico (llamadas perdidas = dinero perdido). Mostrar demo en vivo de conversación de reserva. Enfatizar que es plug-and-play, sin cambiar nada de su operativa actual. Cerrar con prueba gratuita de 14 días sin compromiso.",
  summary_for_sales:
    "Restaurante italiano en Madrid con dependencia total del teléfono para reservas. Dolor principal: llamadas perdidas en horas punta (estimamos 20/semana). Oportunidad clara de recepcionista IA con ROI inmediato de 3.000-5.000€/mes. Alta probabilidad de cierre si demostramos impacto económico.",
  detected_services: ["Comida italiana", "Menú del día", "Eventos privados", "Catering"],
  detected_channels: ["Web", "Teléfono", "Instagram", "Google Maps"],
  created_at: "2024-01-15T12:00:00Z",
};

export const mockDemo: DemoGeneration = {
  id: "d1",
  business_id: "1",
  demo_type: "recepcionista_ia",
  demo_title: "Recepcionista IA para Trattoria Milano",
  demo_summary:
    "Asistente virtual inteligente que gestiona reservas, responde consultas sobre menú y horarios, y capta leads de forma automática 24/7.",
  favorite: true,
  preview_status: null,
  preview_url: null,
  created_at: "2024-01-15T14:00:00Z",
  demo_payload: {
    problem:
      "Trattoria Milano pierde reservas potenciales cuando no puede atender el teléfono, especialmente durante las horas de servicio. Los clientes que llaman fuera de horario no tienen forma de reservar.",
    solution:
      "Un asistente IA disponible 24/7 que gestiona reservas por web y WhatsApp, responde preguntas frecuentes sobre el menú, horarios y ubicación, y capta datos de clientes interesados en eventos y celebraciones.",
    benefits: [
      "Reservas 24/7 sin intervención humana",
      "0 llamadas perdidas = 0 reservas perdidas",
      "Captación automática de eventos y celebraciones",
      "Respuesta instantánea sobre menú, horarios y ubicación",
      "Base de datos de clientes para marketing futuro",
    ],
    cta: "Agenda una llamada de 15 minutos para ver cómo funcionaría en tu restaurante",
    conversation_examples: [
      { role: "cliente", message: "Hola, quiero reservar mesa para 4 personas el viernes a las 21h" },
      {
        role: "ia",
        message:
          "¡Hola! 🍝 Perfecto, tenemos disponibilidad el viernes a las 21:00 para 4 personas. ¿A nombre de quién hago la reserva?",
      },
      { role: "cliente", message: "A nombre de García. ¿Tenéis terraza?" },
      {
        role: "ia",
        message:
          "Reserva confirmada a nombre de García, viernes 21:00, 4 personas. Sí, tenemos terraza disponible. ¿Prefieren mesa en terraza o interior?",
      },
      { role: "cliente", message: "Terraza, por favor" },
      {
        role: "ia",
        message:
          "Perfecto, mesa en terraza confirmada. Les enviaré un recordatorio el jueves. ¿Alguna preferencia alimentaria o celebración especial? 🎉",
      },
    ],
  },
};

export const mockEmail: OutreachEmail = {
  id: "e1",
  business_id: "1",
  recipient_email: "info@trattoriamilano.es",
  subject: "Hemos preparado algo para Trattoria Milano — demo gratuita",
  body: `Hola,

Me pongo en contacto desde HAT3X. Somos una consultora especializada en automatización e inteligencia artificial para negocios.

Hemos analizado la web de Trattoria Milano y hemos detectado una oportunidad muy interesante: un asistente virtual que podría gestionar vuestras reservas de forma automática, 24/7, sin perder ni una llamada.

Hemos preparado una demo gratuita y personalizada para vuestro restaurante. Sin compromiso, solo para que veáis cómo funcionaría.

¿Os gustaría echarle un vistazo? Podemos agendar una llamada rápida de 15 minutos.

Un saludo,
HAT3X — Automatización inteligente para negocios`,
  preheader: "Demo gratuita preparada para vuestro restaurante.",
  send_status: "borrador",
  send_mode: null,
  edited_before_send: null,
  sent_at: null,
  created_at: "2024-01-15T15:00:00Z",
};

/** Look up a mock business by id. Returns undefined if not found. */
export function getMockBusinessById(id: string): Business | undefined {
  return mockBusinesses.find((b) => b.id === id);
}

/** Look up mock analysis by business id. Returns undefined if not found. */
export function getMockAnalysisByBusinessId(businessId: string): BusinessAnalysis | undefined {
  return mockAnalysis.business_id === businessId ? mockAnalysis : undefined;
}

/** Look up mock demo by business id. Returns undefined if not found. */
export function getMockDemoByBusinessId(businessId: string): DemoGeneration | undefined {
  return mockDemo.business_id === businessId ? mockDemo : undefined;
}
