-- supabase/migrations/005_crm_tables.sql

CREATE TABLE IF NOT EXISTS hat3x_projects (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id   TEXT        REFERENCES hat3x_clients(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'proposal'
                          CHECK (status IN ('proposal','active','delivered','invoiced','paid','cancelled')),
  phase       TEXT        CHECK (phase IN ('discovery','design','development','review','launch')),
  pm_vertical TEXT        CHECK (pm_vertical IN ('voz','chatbots','webs-apps','automatizaciones','operaciones')),
  budget      NUMERIC(12,2),
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hat3x_project_financials (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT        NOT NULL REFERENCES hat3x_projects(id) ON DELETE CASCADE,
  client_id   TEXT        REFERENCES hat3x_clients(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL CHECK (type IN ('income','expense')),
  concept     TEXT        NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','invoiced','paid','cancelled')),
  invoice_ref TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hat3x_project_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT        NOT NULL REFERENCES hat3x_projects(id) ON DELETE CASCADE,
  client_id   TEXT        REFERENCES hat3x_clients(id) ON DELETE SET NULL,
  content     TEXT        NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'jarvis'
                          CHECK (source IN ('jarvis','manual','telegram')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_client    ON hat3x_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status    ON hat3x_projects(status);
CREATE INDEX IF NOT EXISTS idx_financials_project ON hat3x_project_financials(project_id);
CREATE INDEX IF NOT EXISTS idx_financials_date    ON hat3x_project_financials(date);
CREATE INDEX IF NOT EXISTS idx_notes_project      ON hat3x_project_notes(project_id);
