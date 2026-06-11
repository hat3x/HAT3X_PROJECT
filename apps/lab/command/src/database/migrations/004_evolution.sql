-- 004_evolution.sql
-- evolution_log: one row per automatic change applied by the Learning Officer
CREATE TABLE IF NOT EXISTS evolution_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT,
  agent_id      TEXT,
  vertical      TEXT,
  change_type   TEXT NOT NULL,           -- 'score_adjustment' | 'anti_pattern' | 'note'
  description   TEXT NOT NULL,
  before_value  JSONB,
  after_value   JSONB,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by    TEXT NOT NULL DEFAULT 'learning-officer'
);

-- evolution_proposals: major changes that require human approval
CREATE TABLE IF NOT EXISTS evolution_proposals (
  id            TEXT PRIMARY KEY,        -- PROP-001, PROP-002...
  description   TEXT NOT NULL,
  impact        TEXT NOT NULL,           -- 'low' | 'medium' | 'high'
  evidence      JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS evolution_log_agent_id_idx ON evolution_log(agent_id);
CREATE INDEX IF NOT EXISTS evolution_log_applied_at_idx ON evolution_log(applied_at);
CREATE INDEX IF NOT EXISTS evolution_proposals_status_idx ON evolution_proposals(status);
