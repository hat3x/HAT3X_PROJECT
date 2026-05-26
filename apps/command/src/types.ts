export type ControlMode = "autopilot" | "phased" | "supervised" | "configurable"

export type TaskStatus = "pending" | "running" | "paused" | "completed" | "failed"

export type SubtaskType =
  | "discovery"
  | "design"
  | "development"
  | "integration"
  | "testing"
  | "security"
  | "performance"
  | "seo"
  | "deployment"
  | "documentation"
  | "communication"

export type Vertical =
  | "chatbots"
  | "voz"
  | "webs-apps"
  | "automatizaciones"
  | "crm"
  | "calendar"
  | "database"
  | "github"
  | "testing"
  | "security"
  | "documentation"
  | "deployment"

export interface Subtask {
  id: string
  description: string
  vertical: Vertical
  skills: string[]
  estimatedHours: number
  dependencies: string[]
}

export interface AgentSelection {
  subtaskId: string
  agentId: string
  score: number
  rationale: string
}

export interface Checkpoint {
  afterPhase: number
  reason: string
  requiredApproval: "jose" | "client" | "both"
}

export interface PhaseSubtask {
  subtaskId: string
  agentId: string
}

export interface Phase {
  phaseNumber: number
  subtasks: PhaseSubtask[]
}

export type RiskLevel = "low" | "medium" | "high"

export interface ExecutionPlan {
  phases: Phase[]
  checkpoints: Checkpoint[]
  totalEstimatedHours: number
  riskLevel: RiskLevel
}

export interface HatTask {
  id: string
  clientId: string | null
  orderRaw: string
  subtasks: Subtask[]
  executionPlan: ExecutionPlan | null
  controlMode: ControlMode
  status: TaskStatus
  createdAt: string
}

export interface ClientMemory {
  id: string
  name: string
  sector: string | null
  previousProjects: string[]
  notes: string | null
}

export interface BusEvent {
  id?: string
  taskId: string
  eventType: string
  agentId: string | null
  payload: Record<string, unknown>
  createdAt?: string
}
