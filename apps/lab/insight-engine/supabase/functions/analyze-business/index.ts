import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Eres un consultor comercial senior especializado en automatización e inteligencia artificial para negocios locales. Trabajas para HAT3X, una consultora de automatización.

Tu objetivo NO es solo clasificar un negocio, sino PENSAR COMO UN VENDEDOR EXPERTO:
- ¿Qué problema le duele MÁS a este negocio?
- ¿Qué solución tendría el MAYOR impacto económico?
- ¿Qué demo impresionaría MÁS al cliente?
- ¿Qué enfoque comercial tiene la MAYOR probabilidad de cierre?

TIPOS DE DEMO disponibles:
- recepcionista_ia: Recepcionista IA (atención 24/7, filtro de consultas)
- reservas_citas: Reservas / Citas (agenda automatizada)
- captacion_leads: Captación de leads (formularios inteligentes, cualificación)
- asistente_ventas: Asistente de ventas (recomendaciones, cierre)
- chatbot: Chatbot web/WhatsApp (atención automatizada)
- atencion_automatizada: Atención automatizada (FAQs, soporte)
- recuperacion_llamadas: Recuperación de llamadas perdidas
- mini_ecommerce: Mini ecommerce (pedidos online)
- fidelizacion: Fidelización (reactivación de clientes)
- onboarding: Onboarding automatizado

SECTORES PRINCIPALES: Restaurante, Clínica dental, Gimnasio, Peluquería/Estética, Comercio local, Inmobiliaria, Taller mecánico, Hotel.

Debes responder con datos MUY ESPECÍFICOS y accionables. No seas genérico.`;

// ── Tool definition (shared schema for all providers) ────────────────────
const TOOL_NAME = "analyze_business";
const TOOL_DESCRIPTION = "Structured business analysis result with commercial scoring";
const TOOL_PARAMETERS = {
  type: "object",
  properties: {
    business_type: { type: "string", description: "Tipo de negocio detectado" },
    sub_type: { type: "string", description: "Subtipo específico" },
    confidence_score: { type: "integer", description: "Score de oportunidad comercial 0-100" },
    scoring_breakdown: {
      type: "object",
      properties: {
        digital_maturity: { type: "integer" },
        pain_intensity: { type: "integer" },
        solution_fit: { type: "integer" },
        economic_potential: { type: "integer" },
        closing_ease: { type: "integer" },
      },
      required: ["digital_maturity", "pain_intensity", "solution_fit", "economic_potential", "closing_ease"],
    },
    detected_services: { type: "array", items: { type: "string" } },
    detected_channels: { type: "array", items: { type: "string" } },
    key_pain_points: { type: "array", items: { type: "string" } },
    key_opportunities: { type: "array", items: { type: "string" } },
    recommended_primary_demo: { type: "string" },
    recommended_secondary_demos: { type: "array", items: { type: "string" } },
    recommendation_justification: { type: "string" },
    commercial_priority: { type: "string", enum: ["alta", "media", "baja"] },
    closing_probability: { type: "integer" },
    estimated_economic_impact: { type: "string" },
    suggested_offer: { type: "string" },
    outreach_angle: { type: "string" },
    sales_approach: { type: "string" },
    summary_for_sales: { type: "string" },
  },
  required: [
    "business_type", "sub_type", "confidence_score", "scoring_breakdown",
    "detected_services", "detected_channels", "key_pain_points", "key_opportunities",
    "recommended_primary_demo", "recommended_secondary_demos", "recommendation_justification",
    "commercial_priority", "closing_probability", "estimated_economic_impact",
    "suggested_offer", "outreach_angle", "sales_approach", "summary_for_sales",
  ],
};

// ── Provider: Anthropic Claude ────────────────────────────────────────────
async function callAnthropic(userPrompt: string, apiKey: string): Promise<Record<string, unknown>> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        input_schema: TOOL_PARAMETERS,
      }],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic error ${response.status}: ${err}`);
  }

  const result = await response.json();
  const toolUse = result.content?.find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use block in Anthropic response");
  return toolUse.input as Record<string, unknown>;
}

// ── Provider: Google Gemini ────────────────────────────────────────────────
async function callGemini(userPrompt: string, apiKey: string): Promise<Record<string, unknown>> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        tools: [{
          functionDeclarations: [{
            name: TOOL_NAME,
            description: TOOL_DESCRIPTION,
            parameters: TOOL_PARAMETERS,
          }],
        }],
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: [TOOL_NAME] },
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429) throw new Error("RATE_LIMIT");
    throw new Error(`Gemini error ${response.status}: ${err}`);
  }

  const result = await response.json();
  const functionCall = result.candidates?.[0]?.content?.parts?.[0]?.functionCall;
  if (!functionCall) throw new Error("No functionCall in Gemini response");
  return functionCall.args as Record<string, unknown>;
}

// ── Provider: Lovable AI gateway (fallback / OpenAI-compatible) ────────────
async function callLovable(userPrompt: string, apiKey: string): Promise<Record<string, unknown>> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          parameters: TOOL_PARAMETERS,
        },
      }],
      tool_choice: { type: "function", function: { name: TOOL_NAME } },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (response.status === 402) throw new Error("QUOTA_EXCEEDED");
    throw new Error(`Lovable gateway error ${response.status}: ${err}`);
  }

  const result = await response.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool_call in Lovable response");
  return JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
}

// ── Main handler ──────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { business_id, url, name, sector } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY && !LOVABLE_API_KEY) {
      throw new Error("No AI API key configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or LOVABLE_API_KEY.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const userPrompt = `Analiza este negocio como consultor de ventas de HAT3X:

URL: ${url}
${name ? `Nombre: ${name}` : ""}
${sector ? `Sector proporcionado: ${sector}` : "Detecta el sector automáticamente."}

Basándote en la URL y el contexto, realiza un análisis comercial profundo. Piensa:
1. ¿Qué tipo de negocio es y cuál es su situación digital probable?
2. ¿Cuáles son sus puntos de dolor MÁS costosos? (pérdida de clientes, llamadas no atendidas, procesos manuales...)
3. ¿Qué oportunidad de automatización tendría el MAYOR ROI para este negocio?
4. ¿Qué demo de HAT3X le IMPACTARÍA más si se la enseñamos?
5. ¿Cuál es el ángulo comercial con MAYOR probabilidad de cierre?
6. ¿Cuánto podría estar perdiendo este negocio por no tener automatización?

Sé MUY ESPECÍFICO. Usa el nombre del negocio. Menciona números estimados. Piensa en impacto económico real.`;

    // Prefer Anthropic, fall back to Lovable
    let analysis: Record<string, unknown>;
    try {
      if (ANTHROPIC_API_KEY) {
        analysis = await callAnthropic(userPrompt, ANTHROPIC_API_KEY);
      } else if (GEMINI_API_KEY) {
        analysis = await callGemini(userPrompt, GEMINI_API_KEY);
      } else {
        analysis = await callLovable(userPrompt, LOVABLE_API_KEY!);
      }
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      if (msg === "RATE_LIMIT") {
        return new Response(
          JSON.stringify({ error: "Límite de peticiones excedido. Inténtalo en unos segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (msg === "QUOTA_EXCEEDED") {
        return new Response(
          JSON.stringify({ error: "Créditos de IA agotados." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw aiErr;
    }

    // Save analysis to DB
    const { data, error } = await supabase.from("business_analysis").insert({
      business_id,
      business_type: analysis.business_type,
      sub_type: analysis.sub_type,
      confidence_score: analysis.confidence_score,
      scoring_breakdown: analysis.scoring_breakdown,
      detected_services: analysis.detected_services,
      detected_channels: analysis.detected_channels,
      key_pain_points: analysis.key_pain_points,
      key_opportunities: analysis.key_opportunities,
      recommended_primary_demo: analysis.recommended_primary_demo,
      recommended_secondary_demos: analysis.recommended_secondary_demos,
      recommendation_justification: analysis.recommendation_justification,
      commercial_priority: analysis.commercial_priority,
      closing_probability: analysis.closing_probability,
      estimated_economic_impact: analysis.estimated_economic_impact,
      suggested_offer: analysis.suggested_offer,
      outreach_angle: analysis.outreach_angle,
      sales_approach: analysis.sales_approach,
      summary_for_sales: analysis.summary_for_sales,
      analysis_json: analysis,
    }).select().single();

    if (error) {
      console.error("DB insert error:", error);
      throw new Error("Failed to save analysis");
    }

    // Update business status (trigger will log the activity)
    await supabase.from("businesses").update({ status: "analizado" }).eq("id", business_id);

    return new Response(JSON.stringify({ analysis: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("analyze-business error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
