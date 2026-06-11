import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pedidos100montaditos.es",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
};

const MAX_PI_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { pedido_id, session_id } = await req.json();
    if (!pedido_id || !session_id) {
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
      .select("id, total, session_id, numero_pedido, estado, stripe_payment_id, pi_attempts")
      .eq("id", pedido_id)
      .maybeSingle();
    if (pErr || !pedido) throw new Error("pedido no encontrado");
    if (pedido.session_id !== session_id) throw new Error("session_id no coincide");
    if (pedido.estado !== "pendiente_pago") throw new Error("pedido no está pendiente de pago");

    // Recalcular total desde los precios reales de DB, nunca confiar en el total del cliente
    const { data: items, error: iErr } = await supabase
      .from("pedido_items")
      .select("cantidad, precio_unitario")
      .eq("pedido_id", pedido_id);
    if (iErr || !items?.length) throw new Error("items del pedido no encontrados");
    const totalRecalculado = items.reduce((sum, i) => sum + i.cantidad * Number(i.precio_unitario), 0);
    if (totalRecalculado <= 0) throw new Error("importe inválido");

    await supabase.from("pedidos").update({ total: totalRecalculado }).eq("id", pedido_id);

    const env = Deno.env.get("STRIPE_LIVE_API_KEY") ? "live" : "sandbox";
    const stripe = createStripeClient(env);
    const amount = Math.round(totalRecalculado * 100);

    let intent;
    if (pedido.stripe_payment_id?.startsWith("pi_")) {
      try {
        intent = await stripe.paymentIntents.retrieve(pedido.stripe_payment_id);
        if (intent.status === "succeeded") {
          // Pago ya realizado — confirmar el pedido inline (el webhook puede haberse retrasado)
          const hasCocina = !!(await supabase.from("pedido_items").select("id").eq("pedido_id", pedido_id).eq("destino", "cocina").limit(1)).data?.length;
          const hasBebidas = !!(await supabase.from("pedido_items").select("id").eq("pedido_id", pedido_id).eq("destino", "bebidas").limit(1)).data?.length;
          await supabase.from("pedidos").update({
            estado: "pendiente",
            estado_cocina: hasCocina ? "pendiente" : null,
            estado_bebidas: hasBebidas ? "pendiente" : null,
          }).eq("id", pedido_id).eq("estado", "pendiente_pago");
          return new Response(JSON.stringify({ already_paid: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (intent.status === "canceled") {
          intent = null;
        } else if (intent.amount !== amount) {
          intent = await stripe.paymentIntents.update(intent.id, { amount });
        }
      } catch { intent = null; }
    }

    if (!intent) {
      if ((pedido.pi_attempts ?? 0) >= MAX_PI_ATTEMPTS) {
        throw new Error("demasiados intentos de pago para este pedido");
      }
      intent = await stripe.paymentIntents.create({
        amount,
        currency: "eur",
        payment_method_types: ["card"],
        description: `Pedido #${pedido.numero_pedido}`,
        metadata: { pedido_id, session_id },
      });
      await supabase.from("pedidos").update({
        stripe_payment_id: intent.id,
        pi_attempts: (pedido.pi_attempts ?? 0) + 1,
      }).eq("id", pedido_id);
    }

    return new Response(JSON.stringify({
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    const knownErrors = [
      "pedido no encontrado", "session_id no coincide", "pedido no está pendiente de pago",
      "items del pedido no encontrados", "importe inválido", "demasiados intentos de pago para este pedido",
    ];
    const msg = knownErrors.includes((e as Error).message) ? (e as Error).message : "Error interno del servidor";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
