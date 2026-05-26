import type { Vertical } from "../../types.js"

export interface CapabilityEntry {
  vertical: Vertical
  agentId: string
  skills: string[]
  maxParallelSubtasks: number
  typicalHoursPerSubtask: number
  requiresClientApproval: boolean
}

export type CapabilityMap = Record<Vertical, CapabilityEntry>
