import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres un copywriter comercial de élite especializado en ventas B2B de soluciones de automatización e inteligencia artificial. Trabajas para HAT3X.

Tu objetivo es generar emails que:
1. NO parezcan spam ni plantillas genéricas
2. Se sientan PERSONALIZADOS para el negocio específico
3. Transmitan profesionalidad y credibilidad premium
4. Generen CURIOSIDAD y deseo de ver la demo
5. Lleven a AGENDAR UNA REUNIÓN

REGLAS DE COPY:
- Tono: premium, directo, profesional, cercano pero no informal
- Primera línea: gancho que demuestre que conocemos su negocio (dato específico)
- No usar "estimado/a" ni "le informamos"
- Mencionar el negocio por nombre de forma natural
- Hablar de RESULTADOS, no de tecnología
- Incluir un dato de impacto concreto (€, %, tiempo)
- CTA claro: agendar una llamada de 15 minutos
- Firma: HAT3X — Automatización inteligente para negocios
- Longitud: conciso pero completo (150-250 palabras)
- NO incluir emojis en el email
- NO usar palabras como "revolucionario", "disruptivo", "innovador"

ESTRUCTURA IDEAL:
1. Gancho personalizado (1-2 líneas)
2. Qué hemos detectado / preparado (2-3 líneas)
3. Beneficio concreto con dato de impacto (2-3 líneas)
4. CTA para reunión (1-2 líneas)
5. Firma`;

// ── Tool definition ────────────────────────────────────────────────────────
const TOOL_NAME = "generate_email";
const TOOL_PARAMETERS = {
  type: "object",
  properties: {
    subject: {
      type: "string",
      description: "Asunto del email. Corto, personalizado, intrigante. Max 60 caracteres.",
    },
    body: {
      type: "string",
      description: "Cuerpo completo del email en texto plano. Con saltos de línea naturales.",
    },
    preheader: {
      type: "string",
      description: "Texto de preheader para clientes de email (max 100 chars)",
    },
  },
  required: ["subject", "body", "preheader"],
};

// ── Provider: Anthropic Claude ────────────────────────────────────────────
async function callAnthropic(
  userPrompt: string,
  apiKey: string
): Promise<{ subject: string; body: string; preheader: string }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{
        name: TOOL_NAME,
        description: "Generate a professional outreach email",
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
  return toolUse.input as { subject: string; body: string; preheader: string };
}

// ── Provider: Google Gemini ────────────────────────────────────────────────
async function callGemini(
  userPrompt: string,
  apiKey: string
): Promise<{ subject: string; body: string; preheader: string }> {
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
            description: "Generate a professional outreach email",
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
  return functionCall.args as { subject: string; body: string; preheader: string };
}

// ── Provider: Lovable AI gateway (fallback) ───────────────────────────────
async function callLovable(
  userPrompt: string,
  apiKey: string
): Promise<{ subject: string; body: string; preheader: string }> {
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
          description: "Generate a professional outreach email",
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
  return JSON.parse(toolCall.function.arguments) as {
    subject: string;
    body: string;
    preheader: string;
  };
}

// ── Main handler ──────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      business_id,
      business_name,
      business_url,
      business_email,
      analysis_summary,
      pain_points,
      economic_impact,
      suggested_offer,
      outreach_angle,
    } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY && !LOVABLE_API_KEY) {
      throw new Error("No AI API key configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or LOVABLE_API_KEY.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const userPrompt = `Genera un email comercial premium para este negocio:

NEGOCIO: ${business_name}
URL: ${business_url}
EMAIL DESTINO: ${business_email}

ANÁLISIS COMERCIAL:
${analysis_summary}

DOLOR PRINCIPAL:
${pain_points?.[0] ?? "No detectado"}

IMPACTO ECONÓMICO ESTIMADO:
${economic_impact ?? "No estimado"}

OFERTA SUGERIDA:
${suggested_offer}

ÁNGULO COMERCIAL:
${outreach_angle}

Genera el asunto y cuerpo del email. El asunto debe ser corto, intrigante y personalizado (NO genérico). El cuerpo debe seguir las reglas de copy premium.`;

    let emailData: { subject: string; body: string; preheader: string };
    try {
      if (ANTHROPIC_API_KEY) {
        emailData = await callAnthropic(userPrompt, ANTHROPIC_API_KEY);
      } else if (GEMINI_API_KEY) {
        emailData = await callGemini(userPrompt, GEMINI_API_KEY);
      } else {
        emailData = await callLovable(userPrompt, LOVABLE_API_KEY!);
      }
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      if (msg === "RATE_LIMIT") {
        return new Response(
          JSON.stringify({ error: "Límite de peticiones excedido." }),
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

    // Save email draft to DB
    const { data, error } = await supabase
      .from("outreach_emails")
      .insert({
        business_id,
        recipient_email: business_email ?? "",
        subject: emailData.subject,
        body: emailData.body,
        preheader: emailData.preheader,
        send_status: "borrador",
        send_mode: "borrador",
      })
      .select()
      .single();

    if (error) {
      console.error("DB insert error:", error);
      throw new Error("Failed to save email");
    }

    // Update business status (trigger logs the activity)
    await supabase
      .from("businesses")
      .update({ status: "email_preparado" })
      .eq("id", business_id);

    return new Response(JSON.stringify({ email: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("generate-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
