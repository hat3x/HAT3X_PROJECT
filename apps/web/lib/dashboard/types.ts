export interface DashTask {
  id: string
  client_id: string | null
  order_raw: string
  status: string
  control_mode: string
  created_at: string
}

export interface DashCheckpoint {
  id: string
  task_id: string
  after_phase: number
  reason: string
  required_approval: string
  status: string
  feedback: string | null
  triggered_at: string
  resolved_at: string | null
}

export interface EvolutionEntry {
  id: string
  project_id: string | null
  agent_id: string | null
  vertical: string | null
  change_type: string
  description: string
  before_value: unknown
  after_value: unknown
  applied_at: string
  applied_by: string
}

export interface EvolutionProposal {
  id: string
  description: string
  impact: string
  evidence: unknown
  status: string
  feedback: string | null
  created_at: string
  resolved_at: string | null
}
