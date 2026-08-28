import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createStripeClient } from "../_shared/stripe.ts";

// Reconciliación de pagos: revisa los pedidos con PaymentIntent que estén en
// `pendiente_pago` o `cancelado` y, si Stripe dice que el pago está hecho, los
// reactiva. Así un pedido PAGADO nunca queda perdido aunque el webhook/confirm
// fallaran o el cron lo hubiera cancelado. Pensada para ejecutarse cada pocos
// minutos (pg_cron + pg_net o el Cron del panel de Supabase), y también a mano.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const env = Deno.env.get("STRIPE_LIVE_API_KEY") ? "live" : "sandbox";
    const stripe = createStripeClient(env);

    // Ventana de seguridad: últimos 3 días (suficiente para Stripe + recuperar lo reciente).
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString();

    const { data: pedidos, error } = await supabase
      .from("pedidos")
      .select("id, estado, estado_cocina, estado_bebidas, stripe_payment_id")
      .in("estado", ["pendiente_pago", "cancelado"])
      .not("stripe_payment_id", "is", null)
      .gte("created_at", since);
    if (error) throw error;

    let revisados = 0;
    let reactivados = 0;

    for (const p of pedidos ?? []) {
      revisados++;
      let intent;
      try {
        intent = await stripe.paymentIntents.retrieve(p.stripe_payment_id as string);
      } catch {
        continue; // PI no recuperable: lo dejamos como está
      }
      if (intent.status !== "succeeded") continue; // no pagado de verdad → no tocar

      // Pagado → no puede estar cancelado/pendiente_pago.
      const yaProcesado = p.estado_cocina !== null || p.estado_bebidas !== null;
      const patch: Record<string, unknown> = { estado: "pendiente", stripe_payment_id: intent.id };

      if (!yaProcesado) {
        // Aún no se había trabajado: lo metemos en la cola de cocina/bebidas.
        const hasCocina = !!(await supabase
          .from("pedido_items").select("id").eq("pedido_id", p.id).eq("destino", "cocina").limit(1)).data?.length;
        const hasBebidas = !!(await supabase
          .from("pedido_items").select("id").eq("pedido_id", p.id).eq("destino", "bebidas").limit(1)).data?.length;
        patch.estado_cocina = hasCocina ? "pendiente" : null;
        patch.estado_bebidas = hasBebidas ? "pendiente" : null;
      }
      // Si ya estaba procesado (cocina/bebidas con estado) NO los tocamos: solo
      // lo sacamos de "cancelado" para que cuente como pedido pagado. No se re-prepara.

      const { error: upErr } = await supabase
        .from("pedidos")
        .update(patch)
        .eq("id", p.id)
        .in("estado", ["pendiente_pago", "cancelado"]);
      if (!upErr) reactivados++;
    }

    return new Response(JSON.stringify({ ok: true, revisados, reactivados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reconcile-payments error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
