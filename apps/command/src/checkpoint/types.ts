export type CheckpointStatus = "pending" | "approved" | "rejected"
export type CheckpointApproval = "jose" | "client" | "both"

export interface HatCheckpoint {
  id: string
  taskId: string
  afterPhase: number
  reason: string
  requiredApproval: CheckpointApproval
  status: CheckpointStatus
  feedback: string | null
  triggeredAt: string
  resolvedAt: string | null
}
