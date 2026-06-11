-- 003_meetings.sql
-- hat3x_meetings: one row per meeting called by an agent
CREATE TABLE IF NOT EXISTS hat3x_meetings (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES hat3x_tasks(id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,
  called_by     TEXT NOT NULL,              -- agent_id that called the meeting
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','resolved','escalated')),
  round         INTEGER NOT NULL DEFAULT 1, -- voting round counter
  consensus     TEXT,                       -- winning position when resolved
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- hat3x_meeting_votes: one row per agent per round
CREATE TABLE IF NOT EXISTS hat3x_meeting_votes (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES hat3x_meetings(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  position    TEXT NOT NULL,   -- agent's chosen position string
  confidence  NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  round       INTEGER NOT NULL,
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, agent_id, round)
);

CREATE INDEX IF NOT EXISTS hat3x_meetings_task_id_idx ON hat3x_meetings(task_id);
CREATE INDEX IF NOT EXISTS hat3x_meeting_votes_meeting_id_idx ON hat3x_meeting_votes(meeting_id);

-- Enable Supabase Realtime for meetings
ALTER PUBLICATION supabase_realtime ADD TABLE hat3x_meetings;
