// Verifica el PIN de acceso a la sección "Analítica" del dashboard (solo dueño).
// El PIN real vive SOLO como secreto de la función (ANALYTICS_PIN), nunca en el
// código del dashboard ni en la base de datos.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Comparación en tiempo constante para evitar timing attacks triviales.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { pin } = await req.json();
    const expected = Deno.env.get("ANALYTICS_PIN") ?? "";

    const ok = typeof pin === "string" && expected.length > 0 && safeEqual(pin, expected);

    return new Response(JSON.stringify({ ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-admin-pin error", e);
    return new Response(JSON.stringify({ ok: false }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
