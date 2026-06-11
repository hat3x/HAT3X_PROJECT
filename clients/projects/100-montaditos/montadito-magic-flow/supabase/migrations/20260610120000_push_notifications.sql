-- Tabla de suscripciones Web Push por pedido
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    TEXT        NOT NULL,
  pedido_id     UUID        REFERENCES pedidos(id) ON DELETE CASCADE,
  subscription  JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, pedido_id)
);

CREATE INDEX IF NOT EXISTS push_sub_session_idx ON push_subscriptions(session_id);
CREATE INDEX IF NOT EXISTS push_sub_pedido_idx  ON push_subscriptions(pedido_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Permitir inserción anónima (la suscripción contiene un endpoint público del navegador)
CREATE POLICY "allow_insert_push_sub" ON push_subscriptions
  FOR INSERT WITH CHECK (true);


-- ─── Trigger: notificar cuando un pedido pasa a 'listo' ───────────────────────
--
-- PREREQUISITO (ejecutar UNA VEZ en el SQL Editor de Supabase):
--
--   ALTER DATABASE postgres SET "app.settings.push_notify_secret" = 'TU_SECRETO_AQUI';
--
-- El mismo valor debe añadirse como secret de la Edge Function:
--   npx supabase secrets set PUSH_NOTIFY_SECRET=TU_SECRETO_AQUI
--   npx supabase secrets set VAPID_PUBLIC_KEY=BBUwbhLXyo0sHB5G2v5E1hlOixlSRw1fPvFngRo8K7413pbaiaQsc1ZGNYdS2Xu2aJdX_OiiUaCz35FWDnxsphk
--   npx supabase secrets set VAPID_PRIVATE_KEY=kengIIKDnLJF5ja3zuJYKnVc-3ZNXbpWxm4_r39KyaQ
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_order_listo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_secret TEXT;
  v_fired  BOOLEAN := FALSE;
BEGIN
  v_secret := current_setting('app.settings.push_notify_secret', TRUE);
  IF v_secret IS NULL OR v_secret = '' THEN RETURN NEW; END IF;

  IF NEW.estado_cocina  = 'listo' AND OLD.estado_cocina  IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;
  IF NEW.estado_bebidas = 'listo' AND OLD.estado_bebidas IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;
  IF NEW.estado         = 'listo' AND OLD.estado         IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;

  IF v_fired THEN
    PERFORM net.http_post(
      url     := 'https://znmhqnmmktkaillwfscu.supabase.co/functions/v1/notify-order-ready',
      headers := jsonb_build_object(
        'Content-Type',         'application/json',
        'x-push-notify-secret', v_secret
      ),
      body    := jsonb_build_object(
        'pedido_id',     NEW.id,
        'session_id',    NEW.session_id,
        'numero_pedido', NEW.numero_pedido
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_pedido_listo ON pedidos;
CREATE TRIGGER on_pedido_listo
  AFTER UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION notify_order_listo();
