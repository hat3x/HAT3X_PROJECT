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

export interface HatTask {
  id: string
  clientId: string | null
  orderRaw: string
  subtasks: unknown
  executionPlan: unknown
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
