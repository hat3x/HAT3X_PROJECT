CREATE TABLE IF NOT EXISTS hat3x_checkpoints (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES hat3x_tasks(id) ON DELETE CASCADE,
  after_phase INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  required_approval TEXT NOT NULL CHECK (required_approval IN ('jose', 'client', 'both')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback   TEXT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_task
  ON hat3x_checkpoints(task_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkpoints_status
  ON hat3x_checkpoints(status, triggered_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE hat3x_checkpoints;
