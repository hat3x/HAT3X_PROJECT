-- Contador de intentos de creación de PaymentIntent por pedido (rate limiting)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pi_attempts INT NOT NULL DEFAULT 0;

-- Tabla de log de webhooks Stripe para auditoría y deduplicación
CREATE TABLE IF NOT EXISTS webhook_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     TEXT        NOT NULL UNIQUE,
  event_type   TEXT        NOT NULL,
  pedido_id    UUID        REFERENCES pedidos(id) ON DELETE SET NULL,
  payload      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_logs_pedido_id_idx  ON webhook_logs(pedido_id);
CREATE INDEX IF NOT EXISTS webhook_logs_event_type_idx ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS webhook_logs_created_at_idx ON webhook_logs(created_at DESC);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
-- El service_role (Edge Functions) bypasea RLS — no se necesitan políticas públicas
