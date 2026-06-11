import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pedidos100montaditos.es",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
    const t = parts["t"];
    const v1 = parts["v1"];
    if (!t || !v1) return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === v1;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const liveSecret = Deno.env.get("PAYMENTS_WEBHOOK_SECRET");
  const sandboxSecret = Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET");
  const secret = liveSecret || sandboxSecret;

  if (!secret) {
    console.error("Webhook secret no configurado");
    return new Response("webhook not configured", { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing stripe-signature", { status: 400 });

  const payload = await req.text();
  const ok = await verifyStripeSignature(payload, sig, secret);
  if (!ok) {
    console.warn("Firma no válida");
    return new Response("invalid signature", { status: 400, headers: corsHeaders });
  }

  let event: any;
  try { event = JSON.parse(payload); } catch {
    return new Response("bad json", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const type: string = event.type || "";
  const obj = event.data?.object || {};

  const pedidoId =
    obj.metadata?.pedido_id ||
    obj.client_reference_id ||
    event.data?.metadata?.pedido_id ||
    null;

  const paymentId =
    (type.startsWith("payment_intent") ? obj.id : obj.payment_intent) ||
    obj.id ||
    null;

  // Registrar y deduplicar por event.id (Stripe puede reintentar el mismo evento)
  const { error: logErr } = await supabase.from("webhook_logs").insert({
    event_id: event.id,
    event_type: type,
    pedido_id: pedidoId || null,
    payload: event,
  });
  if (logErr?.code === "23505") {
    // Evento ya procesado — responder 200 para que Stripe no siga reintentando
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (logErr) console.error("webhook_logs insert error", logErr);

  const isPaid =
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded" ||
    type === "payment_intent.succeeded" ||
    type === "transaction.completed";

  if (isPaid && pedidoId) {
    const hasCocina = !!(await supabase.from("pedido_items").select("id").eq("pedido_id", pedidoId).eq("destino", "cocina").limit(1)).data?.length;
    const hasBebidas = !!(await supabase.from("pedido_items").select("id").eq("pedido_id", pedidoId).eq("destino", "bebidas").limit(1)).data?.length;

    const { error } = await supabase
      .from("pedidos")
      .update({
        estado: "pendiente",
        estado_cocina: hasCocina ? "pendiente" : null,
        estado_bebidas: hasBebidas ? "pendiente" : null,
        stripe_payment_id: paymentId,
      })
      .eq("id", pedidoId)
      .eq("estado", "pendiente_pago");
    if (error) console.error("update pedido error", error);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
