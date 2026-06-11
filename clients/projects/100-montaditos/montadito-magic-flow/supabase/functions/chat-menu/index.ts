import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pedidos100montaditos.es",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");

    // Cargar menú con categorías
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from("menu_categorias").select("id, nombre").order("orden"),
      supabase
        .from("menu_productos")
        .select("nombre, descripcion, precio, categoria_id")
        .eq("disponible", true),
    ]);

    const catMap = new Map((cats ?? []).map((c: any) => [c.id, c.nombre]));
    const menuText = (prods ?? [])
      .map(
        (p: any) =>
          `- [${catMap.get(p.categoria_id) ?? "Otro"}] ${p.nombre} — ${
            p.precio
          }€${p.descripcion ? ` (${p.descripcion})` : ""}`
      )
      .join("\n");

    const systemPrompt = `Eres el asistente virtual de "100 Montaditos". Ayudas a los clientes a elegir productos del menú según sus gustos, alergias o necesidades.

REGLAS:
- Responde SIEMPRE en español, de forma breve, amable y directa.
- Recomienda SOLO productos del menú listado abajo. Nunca inventes productos.
- Cuando recomiendes, lista 2-5 opciones con su nombre exacto y precio.
- Si el cliente menciona una alergia o ingrediente que no quiere, analiza descripciones y nombres para excluir productos que probablemente lo contengan. Si no estás seguro, avísale de que confirme con el personal.
- Si pregunta por algo que no está en la carta, dilo claramente.
- Mantén el texto BREVE (1-3 frases). NO escribas listas de productos en el texto, los productos se mostrarán como botones aparte.
- IMPORTANTE: Para cada producto que recomiendes, añade al FINAL del mensaje (después del texto) una línea por producto con esta etiqueta exacta: [[add:NOMBRE_EXACTO_DEL_PRODUCTO]] usando el nombre TAL CUAL aparece en el menú (sin negritas, sin precio, sin números extra). Ejemplo de respuesta completa:
"¡Genial! Te recomiendo estas opciones picantes 🌶️
[[add:1 La Isla]]
[[add:23 El Picantón]]"
- NO incluyas el precio ni descripciones junto a la etiqueta. Solo la etiqueta sola en su línea.

MENÚ DISPONIBLE:
${menuText}`;

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiadas peticiones, espera un momento." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Créditos AI agotados. Contacta al administrador.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-menu error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
