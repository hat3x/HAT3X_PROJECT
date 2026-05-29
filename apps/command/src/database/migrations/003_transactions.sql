-- 003_transactions.sql
CREATE TABLE IF NOT EXISTS hat3x_transactions (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT        NOT NULL CHECK (type IN ('income', 'expense')),
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description TEXT        NOT NULL,
  category    TEXT        NOT NULL CHECK (category IN (
    'cliente', 'otro', 'herramientas_saas', 'personal', 'marketing', 'infraestructura'
  )),
  client_id   TEXT        REFERENCES hat3x_clients(id) ON DELETE SET NULL,
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_date       ON hat3x_transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON hat3x_transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_category   ON hat3x_transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_client_id  ON hat3x_transactions (client_id);
