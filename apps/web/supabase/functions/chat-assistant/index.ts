import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Eres el asistente de HAT3X, una agencia digital española especializada en:
- Webs profesionales (diseño, desarrollo, landing pages, mejora de webs existentes)
- Automatización de tareas y procesos empresariales (WhatsApp, formularios, flujos internos)
- Apps y plataformas a medida (áreas privadas, herramientas internas, portales para clientes)
- Integraciones con CRM, APIs y herramientas externas

Información de contacto:
- Email: info@hat3x.com
- Teléfono: +34 614 205 537
- WhatsApp: https://wa.me/34614205537

Páginas disponibles:
- /servicios → Ver todos los servicios
- /casos-de-uso → Ejemplos reales de proyectos
- /proceso → Cómo trabaja HAT3X
- /tu-idea → Formulario para contar su proyecto
- /contacto → Contacto general

INSTRUCCIONES:
- Responde siempre en español, de forma breve, directa y cercana.
- Tu objetivo es entender qué necesita el usuario y orientarle hacia la solución más adecuada.
- No inventes precios ni plazos exactos; di que depende del proyecto y dirígeles a contacto.
- Si no entiendes la pregunta, pregunta brevemente para aclarar.
- Máximo 3 frases por respuesta. Sé conciso y útil.
- No uses listas ni markdown, solo texto plano.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { message, context } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context string for the AI
    let contextInfo = "";
    if (context?.mainTopic) {
      const topicLabels: Record<string, string> = {
        web: "webs y desarrollo web",
        automatizacion: "automatización de procesos",
        app: "apps y plataformas",
        contacto: "contacto con el equipo",
      };
      contextInfo = `El usuario está interesado en: ${topicLabels[context.mainTopic] || context.mainTopic}. `;
    }

    const userPrompt = contextInfo
      ? `${contextInfo}El usuario dice: "${message}"`
      : message;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 200,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiadas peticiones, intenta de nuevo en un momento." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Servicio de IA no disponible temporalmente." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new Error("No response from AI");
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("chat-assistant error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
