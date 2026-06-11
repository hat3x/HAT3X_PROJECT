import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pedidos100montaditos.es",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { pedido_id, session_id, return_url } = await req.json();
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
      .select("id, total, session_id, numero_pedido, estado")
      .eq("id", pedido_id)
      .maybeSingle();
    if (pErr || !pedido) throw new Error("pedido no encontrado");
    if (pedido.session_id !== session_id) throw new Error("session_id no coincide");

    const { data: items, error: iErr } = await supabase
      .from("pedido_items")
      .select("cantidad, precio_unitario, menu_productos(nombre, foto_url)")
      .eq("pedido_id", pedido_id);
    if (iErr || !items?.length) throw new Error("sin items");

    const env = Deno.env.get("STRIPE_LIVE_API_KEY") ? "live" : "sandbox";
    const stripe = createStripeClient(env);

    const base = (return_url || req.headers.get("origin") || "").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${base}/?pago=ok&pedido=${pedido_id}`,
      cancel_url: `${base}/?pago=cancel&pedido=${pedido_id}`,
      client_reference_id: pedido_id,
      metadata: { pedido_id, session_id },
      payment_intent_data: { description: `Pedido #${pedido.numero_pedido}` },
      line_items: items.map((it: any) => ({
        quantity: it.cantidad,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(Number(it.precio_unitario) * 100),
          product_data: {
            name: it.menu_productos?.nombre ?? "Producto",
            ...(it.menu_productos?.foto_url ? { images: [it.menu_productos.foto_url] } : {}),
          },
        },
      })),
    });

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
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
