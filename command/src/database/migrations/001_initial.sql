CREATE TABLE IF NOT EXISTS hat3x_tasks (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  order_raw TEXT NOT NULL,
  subtasks JSONB DEFAULT '[]'::jsonb,
  execution_plan JSONB DEFAULT '{}'::jsonb,
  control_mode TEXT NOT NULL DEFAULT 'phased',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hat3x_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT,
  previous_projects TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL REFERENCES hat3x_tasks(id),
  event_type TEXT NOT NULL,
  agent_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bus_events_task
  ON bus_events(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bus_events_type
  ON bus_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS capability_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  context_tags TEXT[] DEFAULT '{}',
  agents JSONB DEFAULT '[]'::jsonb,
  skills JSONB DEFAULT '[]'::jsonb,
  success_rate FLOAT DEFAULT 0,
  learned_from TEXT[] DEFAULT '{}',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skill_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'partial')),
  sector TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  agent_id TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('auto', 'proposed', 'approved', 'rejected')),
  change_description TEXT NOT NULL,
  before_snapshot JSONB,
  after_snapshot JSONB,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evolution_proposals (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  impact TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER PUBLICATION supabase_realtime ADD TABLE bus_events;
