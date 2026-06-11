-- 005_company_brain.sql
-- Structured company memory for Jarvis / HAT3X Brain.

CREATE TABLE IF NOT EXISTS hat3x_recurring_expenses (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  category      TEXT NOT NULL CHECK (category IN (
    'herramientas_saas', 'infraestructura', 'marketing', 'personal', 'operaciones', 'otro'
  )),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  vendor        TEXT,
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  started_at    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active
  ON hat3x_recurring_expenses(active, amount DESC);

CREATE TABLE IF NOT EXISTS hat3x_project_revenue (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id  TEXT NOT NULL,
  client_id   TEXT REFERENCES hat3x_clients(id) ON DELETE SET NULL,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  concept     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid', 'cancelled')),
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_ref TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_revenue_project
  ON hat3x_project_revenue(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_project_revenue_client
  ON hat3x_project_revenue(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_project_revenue_status
  ON hat3x_project_revenue(status, date DESC);

CREATE TABLE IF NOT EXISTS hat3x_project_costs (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id  TEXT NOT NULL,
  client_id   TEXT REFERENCES hat3x_clients(id) ON DELETE SET NULL,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  category    TEXT NOT NULL CHECK (category IN (
    'herramientas_saas', 'infraestructura', 'freelance', 'ads', 'operaciones', 'otro'
  )),
  description TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor      TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_costs_project
  ON hat3x_project_costs(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_project_costs_client
  ON hat3x_project_costs(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_project_costs_category
  ON hat3x_project_costs(category, date DESC);

CREATE TABLE IF NOT EXISTS hat3x_client_contacts (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id   TEXT NOT NULL REFERENCES hat3x_clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT,
  email       TEXT,
  phone       TEXT,
  channel     TEXT,
  notes       TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client
  ON hat3x_client_contacts(client_id, is_primary DESC);

CREATE TABLE IF NOT EXISTS hat3x_company_memory (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope       TEXT NOT NULL DEFAULT 'company' CHECK (scope IN ('company', 'client', 'project', 'finance', 'operations')),
  entity_id   TEXT,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'jarvis',
  importance  INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_memory_active
  ON hat3x_company_memory(active, importance DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_memory_scope
  ON hat3x_company_memory(scope, entity_id);

CREATE TABLE IF NOT EXISTS hat3x_monthly_finance_snapshots (
  id                         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  month                      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                       INTEGER NOT NULL CHECK (year >= 2024),
  total_income               NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_expense              NUMERIC(10,2) NOT NULL DEFAULT 0,
  recurring_expense_total    NUMERIC(10,2) NOT NULL DEFAULT 0,
  project_revenue_total      NUMERIC(10,2) NOT NULL DEFAULT 0,
  project_cost_total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  margin                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes                      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, year)
);

CREATE INDEX IF NOT EXISTS idx_monthly_finance_snapshots_period
  ON hat3x_monthly_finance_snapshots(year DESC, month DESC);
