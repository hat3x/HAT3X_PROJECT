import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pedidos100montaditos.es",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { pedido_id, session_id, payment_intent_id } = await req.json();
    if (!pedido_id || !session_id || !payment_intent_id) {
      return new Response(JSON.stringify({ error: "missing params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: pedido, error: pErr } = await supabase
      .from("pedidos")
      .select("id, session_id, estado, stripe_payment_id")
      .eq("id", pedido_id)
      .maybeSingle();
    if (pErr || !pedido) throw new Error("pedido no encontrado");
    if (pedido.session_id !== session_id) throw new Error("session_id no coincide");

    // Idempotente: si ya está confirmado, devolvemos ok
    if (pedido.estado !== "pendiente_pago") {
      return new Response(JSON.stringify({ ok: true, already: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = Deno.env.get("STRIPE_LIVE_API_KEY") ? "live" : "sandbox";
    const stripe = createStripeClient(env);

    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    const paid = intent.status === "succeeded" || intent.status === "processing";
    if (!paid) {
      return new Response(JSON.stringify({ ok: false, status: intent.status }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (intent.metadata?.pedido_id && intent.metadata.pedido_id !== pedido_id) {
      throw new Error("pedido_id no coincide con el PaymentIntent");
    }

    const hasCocina = !!(await supabase.from("pedido_items").select("id").eq("pedido_id", pedido_id).eq("destino", "cocina").limit(1)).data?.length;
    const hasBebidas = !!(await supabase.from("pedido_items").select("id").eq("pedido_id", pedido_id).eq("destino", "bebidas").limit(1)).data?.length;

    const { error: upErr } = await supabase
      .from("pedidos")
      .update({
        estado: "pendiente",
        estado_cocina: hasCocina ? "pendiente" : null,
        estado_bebidas: hasBebidas ? "pendiente" : null,
        stripe_payment_id: intent.id,
      })
      .eq("id", pedido_id)
      .eq("estado", "pendiente_pago");
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    const knownErrors = ["pedido no encontrado", "session_id no coincide", "pedido no está pendiente de pago"];
    const msg = knownErrors.includes((e as Error).message) ? (e as Error).message : "Error interno del servidor";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
