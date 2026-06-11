import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VAPID_PUBLIC_KEY   = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY  = Deno.env.get("VAPID_PRIVATE_KEY")!;
const PUSH_NOTIFY_SECRET = Deno.env.get("PUSH_NOTIFY_SECRET") ?? "";

webpush.setVapidDetails("mailto:info@hat3x.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const secret = req.headers.get("x-push-notify-secret");
  if (!secret || secret !== PUSH_NOTIFY_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const { pedido_id, session_id, numero_pedido } = await req.json();
  if (!pedido_id || !session_id) {
    return new Response("missing params", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .eq("session_id", session_id)
    .eq("pedido_id", pedido_id);

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const numStr = String(numero_pedido ?? "").padStart(4, "0");
  const payload = JSON.stringify({
    title: "¡Tu pedido está listo! 🥖",
    body:  `Pedido #${numStr} — Puedes pasar a recogerlo ya.`,
    numero_pedido,
  });

  const results = await Promise.allSettled(
    subs.map((row) => webpush.sendNotification(row.subscription, payload)),
  );

  // Eliminar suscripciones expiradas que el push service rechaza (410 = gone)
  const expiredEndpoints: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const status = (r.reason as any)?.statusCode;
      if (status === 410 || status === 404) {
        expiredEndpoints.push((subs[i].subscription as any).endpoint);
      }
    }
  });
  if (expiredEndpoints.length) {
    for (const endpoint of expiredEndpoints) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("subscription->>endpoint" as any, endpoint);
    }
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return new Response(JSON.stringify({ sent, total: subs.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
